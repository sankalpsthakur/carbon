#!/usr/bin/env python3
"""Make outbound calls via Retell API with 100X ESG Lead Qualification agent."""

import os
import sys
import argparse
import json
import urllib.request
import urllib.error

BASE_URL = "https://api.retellai.com/v2"


def make_call(
    to_number: str,
    contact_name: str,
    company_name: str = "",
    esg_context_found: str = "false",
    esg_hook_fact: str = "",
    from_number: str = None,
    agent_id: str = None,
    extra_vars: dict = None
):
    """Make an outbound call via Retell with all ESG variables."""
    api_key = os.environ.get("RETELL_API_KEY")
    if not api_key:
        print("Error: RETELL_API_KEY not set")
        sys.exit(1)
    
    # Resolve routing config from CLI or env. Avoid committing numbers/agent ids.
    from_number = (from_number or os.environ.get("RETELL_FROM_NUMBER", "")).strip()
    agent_id = (agent_id or os.environ.get("RETELL_AGENT_ID", "")).strip()
    if not from_number:
        print("Error: RETELL_FROM_NUMBER not set (or pass --from)")
        sys.exit(2)
    if not agent_id:
        print("Error: RETELL_AGENT_ID not set (or pass --agent-id)")
        sys.exit(2)
    
    # Clean phone number
    to_clean = to_number.replace(" ", "").replace("-", "")
    
    # Build dynamic variables
    dynamic_vars = {
        "contact_name": contact_name,
        "company_name": company_name,
        "esg_context_found": esg_context_found.lower(),
        "esg_hook_fact": esg_hook_fact,
        "discovered_pain": "",  # Collected during call
    }
    
    # Merge any extra variables
    if extra_vars:
        dynamic_vars.update(extra_vars)
    
    payload = {
        "agent_id": agent_id,
        "from_number": from_number,
        "to_number": to_clean,
        "retell_llm_dynamic_variables": dynamic_vars
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    print(f"📞 Calling {contact_name}" + (f" @ {company_name}" if company_name else "") + "...")
    print(f"   Variables:")
    print(f"   • contact_name: {contact_name}")
    print(f"   • company_name: {company_name or '(not set)'}")
    print(f"   • esg_context_found: {esg_context_found}")
    if esg_hook_fact:
        print(f"   • esg_hook_fact: \"{esg_hook_fact[:50]}{'...' if len(esg_hook_fact) > 50 else ''}\"")
    
    req = urllib.request.Request(
        f"{BASE_URL}/create-phone-call",
        data=json.dumps(payload).encode('utf-8'),
        headers=headers,
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print(f"\n✅ Call initiated!")
            print(f"   Call ID: {data.get('call_id')}")
            print(f"   Agent: {data.get('agent_name')} (v{data.get('agent_version', '?')})")
            print(f"   Status: {data.get('call_status')}")
            return data
    except urllib.error.HTTPError as e:
        error = e.read().decode('utf-8')
        print(f"❌ Failed: {e.code}")
        print(error)
        return None
    except Exception as ex:
        print(f"❌ Error: {ex}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Make outbound calls via Retell 100X ESG Lead Qualification agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Simple call (no ESG context)
  python3 call.py --to "+919818522929" --name "Sanat" --company "Climitra"

  # Call with ESG hook (personalized opener)
  python3 call.py --to "+919818522929" --name "Sanat" --company "Climitra" \\
    --esg-context "true" --esg-hook "focused on climate tech and carbon tracking"

  # Call with custom agent
  python3 call.py --to "+1234567890" --name "John" --agent-id "agent_xxx"
        """
    )
    
    # Required
    parser.add_argument("--to", "-t", required=True, help="Phone number to call (e.g., +919818522929)")
    parser.add_argument("--name", "-n", required=True, help="Contact first name")
    
    # ESG variables
    parser.add_argument("--company", "-c", default="", help="Company name")
    parser.add_argument("--esg-context", "-e", default="false", 
                        choices=["true", "false"], help="ESG context found (true/false)")
    parser.add_argument("--esg-hook", "-k", default="", help="ESG hook fact for personalized opener")
    
    # Optional overrides
    parser.add_argument("--from", "-f", dest="from_number", help="From phone number (or set RETELL_FROM_NUMBER)")
    parser.add_argument("--agent-id", "-a", help="Retell agent ID (or set RETELL_AGENT_ID)")
    parser.add_argument("--vars", "-v", help="Extra variables as JSON")
    
    args = parser.parse_args()
    
    # Parse extra vars if provided
    extra_vars = json.loads(args.vars) if args.vars else None
    
    make_call(
        to_number=args.to,
        contact_name=args.name,
        company_name=args.company,
        esg_context_found=args.esg_context,
        esg_hook_fact=args.esg_hook,
        from_number=args.from_number,
        agent_id=args.agent_id,
        extra_vars=extra_vars
    )


if __name__ == "__main__":
    main()
