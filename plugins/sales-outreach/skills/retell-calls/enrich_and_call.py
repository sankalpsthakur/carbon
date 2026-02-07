#!/usr/bin/env python3
"""
Enriched Retell Call - JIT sustainability report scraping before call.

Flow:
1. Search for company's sustainability/ESG reports
2. Extract hook facts (report year, key topics)
3. Inject into Retell dynamic variables
4. Make the call with hyper-personalized context
"""

import os
import sys
import json
import re
import urllib.request
import urllib.error
import urllib.parse
import argparse
from datetime import datetime

# Retell config
RETELL_API_KEY = os.environ.get("RETELL_API_KEY", "")
# Keep call routing config out of source control. Provide via env or CLI flags.
RETELL_FROM_NUMBER = os.environ.get("RETELL_FROM_NUMBER", "")
RETELL_AGENT_ID = os.environ.get("RETELL_AGENT_ID", "")
RETELL_BASE_URL = "https://api.retellai.com/v2"

# Search config (using Brave if available)
BRAVE_API_KEY = os.environ.get("BRAVE_API_KEY", "")


def log(msg):
    """Print with timestamp."""
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")

def _require_retell_config(from_number: str, agent_id: str) -> tuple[str, str]:
    if not RETELL_API_KEY:
        log("❌ RETELL_API_KEY not set")
        sys.exit(2)
    if not from_number:
        log("❌ RETELL_FROM_NUMBER not set (or pass --from)")
        sys.exit(2)
    if not agent_id:
        log("❌ RETELL_AGENT_ID not set (or pass --agent-id)")
        sys.exit(2)
    return from_number, agent_id


def search_brave(query: str, count: int = 5) -> list:
    """Search using Brave API."""
    if not BRAVE_API_KEY:
        return []
    
    url = "https://api.search.brave.com/res/v1/web/search"
    params = urllib.parse.urlencode({"q": query, "count": count})
    req = urllib.request.Request(
        f"{url}?{params}",
        headers={"X-Subscription-Token": BRAVE_API_KEY}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get("web", {}).get("results", [])
    except Exception as e:
        log(f"Brave search error: {e}")
        return []


def search_with_grok(query: str) -> list:
    """Fallback: Search using Grok/xAI."""
    xai_key = os.environ.get("XAI_API_KEY", "")
    if not xai_key:
        return []
    
    # Use Grok for web search
    url = "https://api.x.ai/v1/chat/completions"
    payload = {
        "model": "grok-2",
        "messages": [
            {"role": "system", "content": "Search the web and return JSON with results."},
            {"role": "user", "content": f"Search: {query}. Return top 3 results as JSON array with title, url, snippet."}
        ]
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {xai_key}",
            "Content-Type": "application/json"
        }
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            # Try to parse JSON from response
            match = re.search(r'\[.*\]', content, re.DOTALL)
            if match:
                return json.loads(match.group())
    except Exception as e:
        log(f"Grok search error: {e}")
    
    return []


def extract_year(text: str) -> str:
    """Extract year from text (2023, 2024, 2025)."""
    match = re.search(r'20(2[3-9]|30)', text)
    return match.group() if match else ""


def extract_key_topics(text: str) -> list:
    """Extract ESG key topics from snippet."""
    topics = []
    text_lower = text.lower()
    
    topic_patterns = [
        (r'net[- ]?zero', 'Net Zero commitment'),
        (r'scope\s*3', 'Scope 3 emissions'),
        (r'scope\s*1\s*(and|&)\s*2', 'Scope 1 & 2 reporting'),
        (r'carbon\s*neutral', 'carbon neutrality'),
        (r'2030\s*target', '2030 targets'),
        (r'2050\s*target', '2050 targets'),
        (r'sbti|science.based', 'Science-Based Targets'),
        (r'csrd|esrs', 'CSRD compliance'),
        (r'tcfd', 'TCFD alignment'),
        (r'ghg\s*emissions', 'GHG emissions tracking'),
        (r'supply\s*chain', 'supply chain sustainability'),
        (r'circular\s*economy', 'circular economy initiatives'),
    ]
    
    for pattern, topic in topic_patterns:
        if re.search(pattern, text_lower):
            topics.append(topic)
    
    return topics[:3]  # Max 3 topics


def fetch_sustainability_context(company_domain: str, company_name: str = "") -> dict:
    """
    JIT scraping for sustainability report context.
    Returns enrichment data for Retell dynamic variables.
    """
    log(f"🔍 Searching for sustainability context: {company_domain}")
    
    # Construct search queries
    queries = [
        f'site:{company_domain} filetype:pdf "sustainability report" 2024 2025',
        f'{company_domain} ESG report 2025 key highlights carbon',
        f'"{company_name}" sustainability report 2024' if company_name else None,
    ]
    queries = [q for q in queries if q]
    
    all_results = []
    
    # Try Brave first
    for query in queries[:2]:
        log(f"   Query: {query[:50]}...")
        results = search_brave(query)
        if results:
            all_results.extend(results)
            break
    
    # Fallback to Grok if no results
    if not all_results:
        log("   Falling back to Grok search...")
        for query in queries[:1]:
            results = search_with_grok(query)
            all_results.extend(results)
            if results:
                break
    
    if not all_results:
        log("   ❌ No sustainability reports found")
        return {
            "esg_context_found": False,
            "esg_report_year": "",
            "esg_hook_fact": "",
            "esg_report_url": ""
        }
    
    # Find the best result (prefer PDFs, recent years)
    best_result = None
    for r in all_results:
        title = r.get("title", "")
        url = r.get("url", "")
        snippet = r.get("description", r.get("snippet", ""))
        
        # Prefer PDF reports
        if ".pdf" in url.lower() or "report" in title.lower():
            best_result = r
            break
    
    if not best_result:
        best_result = all_results[0]
    
    title = best_result.get("title", "")
    url = best_result.get("url", "")
    snippet = best_result.get("description", best_result.get("snippet", ""))
    
    # Extract context
    year = extract_year(title + " " + snippet)
    topics = extract_key_topics(title + " " + snippet)
    
    # Build the hook fact
    if year and topics:
        hook = f"your {year} report mentioned a focus on {topics[0]}"
    elif year:
        hook = f"your {year} sustainability report"
    elif topics:
        hook = f"your focus on {topics[0]}"
    else:
        hook = "your sustainability initiatives"
    
    log(f"   ✅ Found: {year or 'recent'} report - {', '.join(topics) or 'general ESG'}")
    
    return {
        "esg_context_found": True,
        "esg_report_year": year or "recent",
        "esg_hook_fact": hook,
        "esg_report_url": url,
        "esg_topics": ", ".join(topics) if topics else ""
    }


def make_retell_call(
    to_number: str,
    contact_name: str,
    company_name: str,
    esg_context: dict,
    company_industry: str = "sustainability",
    from_number: str | None = None,
    agent_id: str | None = None,
) -> dict:
    """Make Retell call with enriched context."""

    from_number = (from_number or RETELL_FROM_NUMBER).strip()
    agent_id = (agent_id or RETELL_AGENT_ID).strip()
    from_number, agent_id = _require_retell_config(from_number, agent_id)
    
    # Clean phone number
    to_clean = to_number.replace(" ", "").replace("-", "")
    
    # Build dynamic variables
    dynamic_vars = {
        "contact_name": contact_name,
        "company_name": company_name,
        "company_industry": company_industry,
        "esg_context_found": str(esg_context.get("esg_context_found", False)).lower(),
        "esg_report_year": esg_context.get("esg_report_year", ""),
        "esg_hook_fact": esg_context.get("esg_hook_fact", ""),
        "esg_topics": esg_context.get("esg_topics", ""),
    }
    
    payload = {
        "agent_id": agent_id,
        "from_number": from_number,
        "to_number": to_clean,
        "retell_llm_dynamic_variables": dynamic_vars
    }
    
    log(f"📞 Dialing {contact_name} at {to_clean}...")
    
    req = urllib.request.Request(
        f"{RETELL_BASE_URL}/create-phone-call",
        data=json.dumps(payload).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {RETELL_API_KEY}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            log(f"✅ Call initiated! ID: {data.get('call_id')}")
            return data
    except urllib.error.HTTPError as e:
        error = e.read().decode('utf-8')
        log(f"❌ Call failed: {e.code} - {error}")
        return {"error": error}
    except Exception as e:
        log(f"❌ Call error: {e}")
        return {"error": str(e)}


def enrich_and_call(
    to_number: str,
    contact_name: str,
    company_name: str,
    company_domain: str,
    company_industry: str = "sustainability",
    from_number: str | None = None,
    agent_id: str | None = None,
):
    """
    Main function: Enrich with JIT search, then call.
    """
    print("=" * 50)
    print(f"🎯 ENRICHED CALL: {contact_name} @ {company_name}")
    print("=" * 50)
    
    # Step 1: JIT Enrichment
    esg_context = fetch_sustainability_context(company_domain, company_name)
    
    # Step 2: Show what we found
    if esg_context.get("esg_context_found"):
        print(f"\n📊 ESG Context Found:")
        print(f"   Year: {esg_context.get('esg_report_year')}")
        print(f"   Hook: \"{esg_context.get('esg_hook_fact')}\"")
        print(f"   Topics: {esg_context.get('esg_topics')}")
    else:
        print(f"\n⚠️  No specific ESG report found - using industry fallback")
    
    # Step 3: Make the call
    print()
    result = make_retell_call(
        to_number=to_number,
        contact_name=contact_name,
        company_name=company_name,
        esg_context=esg_context,
        company_industry=company_industry,
        from_number=from_number,
        agent_id=agent_id,
    )
    
    return result


def main():
    parser = argparse.ArgumentParser(description="Make enriched Retell call with JIT ESG context")
    parser.add_argument("--to", "-t", required=True, help="Phone number to call")
    parser.add_argument("--name", "-n", required=True, help="Contact first name")
    parser.add_argument("--company", "-c", required=True, help="Company name")
    parser.add_argument("--domain", "-d", required=True, help="Company domain (e.g., anthesisgroup.com)")
    parser.add_argument("--industry", "-i", default="sustainability", help="Company industry")
    parser.add_argument("--from", dest="from_number", default=None, help="Retell from number (or set RETELL_FROM_NUMBER)")
    parser.add_argument("--agent-id", default=None, help="Retell agent ID (or set RETELL_AGENT_ID)")
    
    args = parser.parse_args()
    
    result = enrich_and_call(
        to_number=args.to,
        contact_name=args.name,
        company_name=args.company,
        company_domain=args.domain,
        company_industry=args.industry,
        from_number=args.from_number,
        agent_id=args.agent_id,
    )
    
    print(f"\n📋 Result: {json.dumps(result, indent=2)}")


if __name__ == "__main__":
    main()
