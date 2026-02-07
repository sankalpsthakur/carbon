#!/usr/bin/env python3
"""
Retell Webhook Handler — Auto-update CRM after calls

Receives post-call webhooks from Retell, extracts call data, and updates
crm/leads/leads.csv with call notes, outcomes, and status changes.

Setup:
    1. pip install flask
    2. Set RETELL_API_KEY environment variable
    3. Run: python3 webhook_handler.py
    4. Configure webhook URL in Retell dashboard or agent settings

For local testing, use ngrok:
    ngrok http 5050
    Then set the ngrok URL as your webhook in Retell
"""

import os
import sys
import csv
import json
import hmac
import hashlib
import subprocess
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, Tuple

try:
    from flask import Flask, request, jsonify
except ImportError:
    print("Flask not installed. Run: pip install flask")
    sys.exit(1)


# Configuration
WEBHOOK_PORT = int(os.environ.get("WEBHOOK_PORT", 5050))
CRM_CSV_PATH = Path(__file__).parent.parent.parent.parent / "crm" / "leads" / "leads.csv"
CALL_LOG_DIR = Path(__file__).parent / "call_logs"

# Google Calendar/Email config (uses gog CLI)
CALENDAR_ID = os.environ.get("CALENDAR_ID", "primary")
FROM_EMAIL = os.environ.get("GOG_ACCOUNT", "")  # Set this or gog uses default

app = Flask(__name__)


def verify_signature(payload: bytes, signature: str) -> bool:
    """
    Verify the webhook signature from Retell.
    
    The signature is created using HMAC-SHA256 with your API key.
    Retell sends it in the x-retell-signature header.
    """
    api_key = os.environ.get("RETELL_API_KEY")
    if not api_key:
        print("⚠️  RETELL_API_KEY not set - skipping signature verification")
        return True  # Allow in dev mode
    
    expected = hmac.new(
        api_key.encode('utf-8'),
        payload,
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected)


def extract_call_data(webhook_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract relevant fields from the Retell webhook payload.
    
    Returns a dict with:
        - call_id, phone, contact_name, company_name
        - outcome (from call_analysis or disconnection_reason)
        - transcript_summary
        - collected_variables (pain points, interests, etc.)
        - duration_seconds
    """
    call = webhook_data.get("call", {})
    analysis = call.get("call_analysis", {})
    dynamic_vars = call.get("retell_llm_dynamic_variables", {})
    collected_vars = call.get("collected_dynamic_variables", {})
    
    # Extract basic info
    data = {
        "call_id": call.get("call_id"),
        "event": webhook_data.get("event"),
        "timestamp": datetime.now().isoformat(),
        "phone": call.get("to_number") or call.get("from_number"),
        "direction": call.get("direction", "outbound"),
        
        # From dynamic variables (what we sent)
        "contact_name": dynamic_vars.get("contact_name", ""),
        "company_name": dynamic_vars.get("company_name", ""),
        
        # Call outcome
        "disconnection_reason": call.get("disconnection_reason"),
        "call_successful": analysis.get("call_successful"),
        "user_sentiment": analysis.get("user_sentiment"),
        "in_voicemail": analysis.get("in_voicemail", False),
        
        # Transcript
        "transcript": call.get("transcript", ""),
        "transcript_summary": analysis.get("call_summary", ""),
        
        # Collected during call (from conversation flow)
        "collected_variables": collected_vars,
        
        # Custom analysis data (if configured in agent)
        "custom_analysis": analysis.get("custom_analysis_data", {}),
        
        # Duration
        "duration_ms": call.get("duration_ms", 0),
        "duration_seconds": call.get("duration_ms", 0) // 1000,
        
        # Recording (available for 10 min)
        "recording_url": call.get("recording_url"),
    }
    
    return data


def determine_crm_status(call_data: Dict[str, Any]) -> Tuple[str, str]:
    """
    Determine CRM stage and status based on call outcome.
    
    Returns (stage, status_note)
    """
    reason = call_data.get("disconnection_reason", "")
    successful = call_data.get("call_successful")
    sentiment = call_data.get("user_sentiment", "")
    voicemail = call_data.get("in_voicemail", False)
    collected = call_data.get("collected_variables", {})
    
    # Check for meeting booked first (highest priority)
    meeting_time = parse_meeting_datetime(collected)
    if meeting_time:
        return "Meeting Booked", f"Meeting scheduled for {meeting_time.strftime('%Y-%m-%d %H:%M')}"
    
    # Voicemail
    if voicemail:
        return "Voicemail", "Left voicemail"
    
    # Call failed/errored
    if reason in ("error_inbound_webhook", "machine_hangup", "dial_busy", "dial_no_answer"):
        return "No Answer", f"Call failed: {reason}"
    
    # User hung up quickly
    if reason == "user_hangup" and call_data.get("duration_seconds", 0) < 30:
        return "Not Interested", "Quick hangup (<30s)"
    
    # Check for positive signals
    if successful or sentiment == "Positive":
        # Check if we collected any qualification data
        if collected.get("discovered_pain") or collected.get("interest_level"):
            return "Qualified", "Positive call - qualified"
        return "Interested", "Positive response"
    
    if sentiment == "Negative":
        return "Not Interested", "Negative sentiment"
    
    # Default - call completed but unclear outcome
    if reason in ("agent_hangup", "user_hangup"):
        return "Contacted", f"Call completed ({call_data.get('duration_seconds', 0)}s)"
    
    return "Contacted", f"Call ended: {reason}"


def update_crm_csv(call_data: Dict[str, Any]) -> bool:
    """
    Update leads.csv with call data.
    
    Matches by phone number or contact_name+company_name.
    Updates: stage, last_touch, next_touch, notes
    """
    if not CRM_CSV_PATH.exists():
        print(f"❌ CRM file not found: {CRM_CSV_PATH}")
        return False
    
    # Read existing data
    with open(CRM_CSV_PATH, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)
    
    # Find matching lead
    phone = call_data.get("phone", "").replace("+", "").replace("-", "").replace(" ", "")
    contact = call_data.get("contact_name", "").lower()
    company = call_data.get("company_name", "").lower()
    
    matched_idx = None
    for idx, row in enumerate(rows):
        # Match by company name (case insensitive)
        row_company = row.get("company", "").lower()
        row_contact = row.get("contact_name", "").lower()
        
        if company and company in row_company:
            matched_idx = idx
            break
        if contact and contact in row_contact:
            matched_idx = idx
            break
    
    if matched_idx is None:
        print(f"⚠️  No matching lead found for {contact} @ {company}")
        return False
    
    # Determine new stage and build notes
    stage, status_note = determine_crm_status(call_data)
    
    # Build call note
    today = datetime.now().strftime("%Y-%m-%d")
    note_parts = [f"Retell call {today}: {status_note}"]
    
    if call_data.get("transcript_summary"):
        note_parts.append(call_data["transcript_summary"])
    
    # Add collected variables (pain points, interests, etc.)
    collected = call_data.get("collected_variables", {})
    if collected:
        for key, value in collected.items():
            if value and key not in ("last_node_name", "meeting_datetime", "meeting_date", "meeting_time"):
                note_parts.append(f"{key}: {value}")
    
    # Add meeting info if scheduled
    if call_data.get("meeting_scheduled"):
        meeting_time = parse_meeting_datetime(collected)
        if meeting_time:
            meeting_str = meeting_time.strftime("%Y-%m-%d %H:%M")
            note_parts.append(f"📅 Meeting booked: {meeting_str}")
        if call_data.get("event_link"):
            note_parts.append(f"Cal: {call_data['event_link']}")
        # Update stage to Meeting Booked
        stage = "Meeting Booked"
    
    # Add phone if not in record
    if phone and "Phone:" not in (rows[matched_idx].get("notes", "") or ""):
        note_parts.append(f"Phone: {call_data.get('phone')}")
    
    call_note = ". ".join(note_parts)
    
    # Update row
    existing_notes = rows[matched_idx].get("notes", "") or ""
    rows[matched_idx]["stage"] = stage
    rows[matched_idx]["last_touch"] = today
    rows[matched_idx]["notes"] = f"{existing_notes} | {call_note}" if existing_notes else call_note
    
    # Set next touch based on outcome
    if stage == "Meeting Booked":
        # Set next touch to meeting date
        meeting_time = parse_meeting_datetime(collected)
        if meeting_time:
            rows[matched_idx]["next_touch"] = meeting_time.strftime("%Y-%m-%d")
    elif stage in ("Qualified", "Interested"):
        next_touch = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
        rows[matched_idx]["next_touch"] = next_touch
    
    # Update score based on outcome
    current_score = int(rows[matched_idx].get("score", 50) or 50)
    if stage == "Meeting Booked":
        rows[matched_idx]["score"] = str(min(100, current_score + 25))
    elif stage == "Qualified":
        rows[matched_idx]["score"] = str(min(100, current_score + 15))
    elif stage == "Interested":
        rows[matched_idx]["score"] = str(min(100, current_score + 10))
    elif stage == "Not Interested":
        rows[matched_idx]["score"] = str(max(0, current_score - 20))
    
    # Write back
    with open(CRM_CSV_PATH, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"✅ Updated lead: {rows[matched_idx].get('company')} → {stage}")
    return True


def save_call_log(call_data: Dict[str, Any]) -> None:
    """Save full call data to JSON for debugging/audit."""
    CALL_LOG_DIR.mkdir(exist_ok=True)
    
    log_file = CALL_LOG_DIR / f"{call_data['call_id']}.json"
    with open(log_file, 'w') as f:
        json.dump(call_data, f, indent=2, default=str)
    
    print(f"📝 Saved call log: {log_file}")


def parse_meeting_datetime(collected_vars: Dict[str, Any]) -> Optional[datetime]:
    """
    Parse meeting datetime from collected variables.
    
    Looks for fields like:
        - meeting_datetime: "2026-01-31T10:00:00"
        - meeting_date + meeting_time: "Friday" + "10am"
        - preferred_time: "tomorrow at 2pm"
    
    Returns datetime object or None if not parseable.
    """
    # Check for explicit ISO datetime
    if collected_vars.get("meeting_datetime"):
        try:
            return datetime.fromisoformat(collected_vars["meeting_datetime"])
        except ValueError:
            pass
    
    # Check for date + time combo
    meeting_date = collected_vars.get("meeting_date", "")
    meeting_time = collected_vars.get("meeting_time", "")
    preferred = collected_vars.get("preferred_meeting_time", "")
    
    # Combine available info
    time_str = preferred or f"{meeting_date} {meeting_time}".strip()
    if not time_str:
        return None
    
    # Simple parsing for common patterns
    now = datetime.now()
    time_str_lower = time_str.lower()
    
    # Handle relative days
    if "tomorrow" in time_str_lower:
        base_date = now + timedelta(days=1)
    elif "monday" in time_str_lower:
        days_ahead = (0 - now.weekday()) % 7 or 7
        base_date = now + timedelta(days=days_ahead)
    elif "tuesday" in time_str_lower:
        days_ahead = (1 - now.weekday()) % 7 or 7
        base_date = now + timedelta(days=days_ahead)
    elif "wednesday" in time_str_lower:
        days_ahead = (2 - now.weekday()) % 7 or 7
        base_date = now + timedelta(days=days_ahead)
    elif "thursday" in time_str_lower:
        days_ahead = (3 - now.weekday()) % 7 or 7
        base_date = now + timedelta(days=days_ahead)
    elif "friday" in time_str_lower:
        days_ahead = (4 - now.weekday()) % 7 or 7
        base_date = now + timedelta(days=days_ahead)
    else:
        # Default to tomorrow
        base_date = now + timedelta(days=1)
    
    # Parse time (10am, 2pm, 10:00, 14:00)
    time_match = re.search(r'(\d{1,2})(?::(\d{2}))?\s*(am|pm)?', time_str_lower)
    if time_match:
        hour = int(time_match.group(1))
        minute = int(time_match.group(2) or 0)
        ampm = time_match.group(3)
        
        if ampm == "pm" and hour < 12:
            hour += 12
        elif ampm == "am" and hour == 12:
            hour = 0
        
        return base_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
    
    # Default to 10am if no time specified
    return base_date.replace(hour=10, minute=0, second=0, microsecond=0)


def create_calendar_event(
    contact_name: str,
    company_name: str,
    email: str,
    meeting_time: datetime,
    call_summary: str = ""
) -> Tuple[bool, str]:
    """
    Create Google Calendar event using gog CLI.
    
    Returns (success, event_id_or_error)
    """
    # Calculate end time (30 min meeting)
    end_time = meeting_time + timedelta(minutes=30)
    
    # Format times as ISO
    start_iso = meeting_time.strftime("%Y-%m-%dT%H:%M:%S")
    end_iso = end_time.strftime("%Y-%m-%dT%H:%M:%S")
    
    # Build event summary and description
    summary = f"100x AI Sprint Intro: {company_name}"
    description = f"""Discovery call with {contact_name} from {company_name}

Meeting scheduled via Retell AI call.

Call summary: {call_summary or 'N/A'}

---
100x AI Engineering
https://100xai.engineering
"""
    
    # Create event via gog
    cmd = [
        "gog", "calendar", "create", CALENDAR_ID,
        "--summary", summary,
        "--from", start_iso,
        "--to", end_iso,
        "--description", description,
        "--event-color", "9",  # Blue
        "--json"
    ]
    
    # Add attendee if we have email
    if email:
        cmd.extend(["--attendees", email])
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            # Try to parse event ID from JSON output
            try:
                event_data = json.loads(result.stdout)
                event_id = event_data.get("id", "created")
                event_link = event_data.get("htmlLink", "")
                print(f"✅ Calendar event created: {event_link or event_id}")
                return True, event_link or event_id
            except json.JSONDecodeError:
                print(f"✅ Calendar event created (non-JSON response)")
                return True, "created"
        else:
            print(f"❌ Calendar creation failed: {result.stderr}")
            return False, result.stderr
    except subprocess.TimeoutExpired:
        return False, "Timeout creating calendar event"
    except FileNotFoundError:
        return False, "gog CLI not found - install with: brew install steipete/tap/gogcli"


def generate_one_pager_html(
    contact_name: str,
    company_name: str,
    call_summary: str,
    collected_vars: Dict[str, Any],
    meeting_time: datetime
) -> str:
    """
    Generate personalized one-pager HTML based on call context.
    
    Includes:
    - Next steps from the call
    - 100X ESG Toolkit overview
    - Pain points addressed
    """
    # Extract relevant collected data
    pain_points = collected_vars.get("discovered_pain", "")
    interest_area = collected_vars.get("interest_level", "") or collected_vars.get("interest_area", "")
    use_case = collected_vars.get("use_case", "")
    
    meeting_str = meeting_time.strftime("%A, %B %d at %I:%M %p")
    
    # Build next steps from call context
    next_steps = []
    if call_summary:
        next_steps.append(f"Review discussion points from our call")
    next_steps.append(f"Discovery call: {meeting_str}")
    next_steps.append("Scope your specific AI use case")
    next_steps.append("Proposal with timeline + deliverables")
    
    next_steps_html = "".join(f"<li>{step}</li>" for step in next_steps)
    
    # Build pain points section if we have them
    pain_section = ""
    if pain_points:
        pain_section = f"""
        <tr><td style="padding: 20px 30px;">
            <p style="color: #666; margin: 0 0 10px;"><strong>What we heard:</strong></p>
            <p style="color: #333; margin: 0; font-style: italic;">"{pain_points}"</p>
        </td></tr>
        """
    
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">

<table width="100%" cellpadding="0" cellspacing="0" style="background: #f8f9fa; border-radius: 8px; margin-bottom: 20px;">
    <tr><td style="padding: 30px; text-align: center;">
        <h1 style="margin: 0; color: #1a1a1a; font-size: 24px;">100x AI Engineering</h1>
        <p style="margin: 5px 0 0; color: #666;">ESG & CSRD-Ready AI Solutions</p>
    </td></tr>
</table>

<p>Hi {contact_name},</p>

<p>Great connecting today! Here's a quick summary and next steps for {company_name}.</p>

{f'<table width="100%" cellpadding="0" cellspacing="0" style="background: #fff3cd; border-left: 4px solid #ffc107; margin: 20px 0;">{pain_section}</table>' if pain_section else ''}

<table width="100%" cellpadding="0" cellspacing="0" style="background: #e8f4f8; border-radius: 8px; margin: 20px 0;">
    <tr><td style="padding: 20px 30px;">
        <h2 style="margin: 0 0 15px; color: #0066cc; font-size: 18px;">📋 Next Steps</h2>
        <ol style="margin: 0; padding-left: 20px; color: #333;">
            {next_steps_html}
        </ol>
    </td></tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e0e0e0; border-radius: 8px; margin: 20px 0;">
    <tr><td style="padding: 20px 30px; background: #fafafa; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; color: #1a1a1a; font-size: 18px;">🌱 100X ESG Toolkit</h2>
    </td></tr>
    <tr><td style="padding: 20px 30px;">
        <p style="margin: 0 0 15px;"><strong>Built for CSRD/ESRS compliance from day one.</strong></p>
        
        <table width="100%" cellpadding="8" cellspacing="0" style="font-size: 14px;">
            <tr>
                <td style="border-bottom: 1px solid #eee;"><strong>📊 Data Collection</strong></td>
                <td style="border-bottom: 1px solid #eee;">Automated ESG data ingestion from existing systems</td>
            </tr>
            <tr>
                <td style="border-bottom: 1px solid #eee;"><strong>🔒 On-Prem Ready</strong></td>
                <td style="border-bottom: 1px solid #eee;">Your data stays on your infrastructure — no cloud lock-in</td>
            </tr>
            <tr>
                <td style="border-bottom: 1px solid #eee;"><strong>📝 ESRS Mapping</strong></td>
                <td style="border-bottom: 1px solid #eee;">AI-assisted mapping to all ESRS disclosure requirements</td>
            </tr>
            <tr>
                <td style="border-bottom: 1px solid #eee;"><strong>🤖 AI Agents</strong></td>
                <td style="border-bottom: 1px solid #eee;">Automate data validation, gap analysis, and reporting drafts</td>
            </tr>
            <tr>
                <td><strong>⚡ 3-Week Sprint</strong></td>
                <td>Working MVP in 3 weeks — $4,999 fixed price</td>
            </tr>
        </table>
    </td></tr>
</table>

<table width="100%" cellpadding="0" cellspacing="0" style="background: #1a1a1a; border-radius: 8px; margin: 20px 0;">
    <tr><td style="padding: 20px 30px; text-align: center;">
        <p style="color: #fff; margin: 0 0 10px; font-size: 16px;"><strong>The 3-Week AI MVP Sprint</strong></p>
        <p style="color: #ccc; margin: 0; font-size: 14px;">$4,999 • Fixed Price • Working System (Not a Prototype)</p>
    </td></tr>
</table>

<p>Looking forward to our call on <strong>{meeting_str}</strong>!</p>

<p>Best,<br>
<strong>Sankalp</strong><br>
100x AI Engineering<br>
<a href="https://100xai.engineering" style="color: #0066cc;">100xai.engineering</a></p>

</body>
</html>
"""
    return html


def send_confirmation_email(
    to_email: str,
    contact_name: str,
    company_name: str,
    meeting_time: datetime,
    call_summary: str = "",
    collected_vars: Dict[str, Any] = None,
    event_link: str = ""
) -> Tuple[bool, str]:
    """
    Send meeting confirmation email with personalized one-pager.
    
    Generates HTML email based on call context + 100X ESG toolkit info.
    Uses gog CLI for Gmail.
    """
    if not to_email:
        return False, "No email address provided"
    
    if collected_vars is None:
        collected_vars = {}
    
    # Format meeting time nicely
    meeting_str = meeting_time.strftime("%A, %B %d at %I:%M %p")
    
    subject = f"100x AI Sprint — Next Steps for {company_name}"
    
    # Generate personalized one-pager HTML
    html_body = generate_one_pager_html(
        contact_name=contact_name,
        company_name=company_name,
        call_summary=call_summary,
        collected_vars=collected_vars,
        meeting_time=meeting_time
    )
    
    # Build command
    cmd = [
        "gog", "gmail", "send",
        "--to", to_email,
        "--subject", subject,
        "--body-html", html_body
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            print(f"✅ Confirmation email sent to {to_email}")
            return True, "sent"
        else:
            print(f"❌ Email send failed: {result.stderr}")
            return False, result.stderr
    except subprocess.TimeoutExpired:
        return False, "Timeout sending email"
    except FileNotFoundError:
        return False, "gog CLI not found"


def schedule_meeting_and_notify(call_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Handle meeting scheduling flow:
    1. Parse collected meeting time
    2. Create calendar event
    3. Send confirmation email
    
    Returns dict with results.
    """
    collected = call_data.get("collected_variables", {})
    results = {
        "meeting_scheduled": False,
        "calendar_created": False,
        "email_sent": False,
        "event_link": "",
        "errors": []
    }
    
    # Parse meeting time from collected variables
    meeting_time = parse_meeting_datetime(collected)
    if not meeting_time:
        # No meeting time collected - skip
        return results
    
    print(f"📅 Meeting time collected: {meeting_time.isoformat()}")
    results["meeting_scheduled"] = True
    
    contact_name = call_data.get("contact_name", "")
    company_name = call_data.get("company_name", "")
    email = collected.get("email") or collected.get("contact_email") or ""
    summary = call_data.get("transcript_summary", "")
    
    # Create calendar event
    success, event_result = create_calendar_event(
        contact_name=contact_name,
        company_name=company_name,
        email=email,
        meeting_time=meeting_time,
        call_summary=summary
    )
    results["calendar_created"] = success
    if success:
        results["event_link"] = event_result
    else:
        results["errors"].append(f"Calendar: {event_result}")
    
    # Send confirmation email
    if email:
        success, email_result = send_confirmation_email(
            to_email=email,
            contact_name=contact_name,
            company_name=company_name,
            meeting_time=meeting_time,
            call_summary=summary,
            collected_vars=collected,
            event_link=results.get("event_link", "")
        )
        results["email_sent"] = success
        if not success:
            results["errors"].append(f"Email: {email_result}")
    else:
        results["errors"].append("No email collected during call")
    
    return results


@app.route("/webhook/retell", methods=["POST"])
def handle_webhook():
    """
    Main webhook endpoint for Retell events.
    
    Handles:
        - call_started: Log only
        - call_ended: Update CRM with call outcome
        - call_analyzed: Update CRM with analysis (summary, sentiment)
    """
    # Verify signature
    signature = request.headers.get("x-retell-signature", "")
    if not verify_signature(request.data, signature):
        return jsonify({"error": "Invalid signature"}), 401
    
    # Parse payload
    try:
        data = request.get_json()
    except Exception as e:
        return jsonify({"error": f"Invalid JSON: {e}"}), 400
    
    event = data.get("event")
    call_id = data.get("call", {}).get("call_id", "unknown")
    
    print(f"\n{'='*50}")
    print(f"📞 Received event: {event} (call_id: {call_id})")
    
    # Extract call data
    call_data = extract_call_data(data)
    
    # Save full log for debugging
    save_call_log(call_data)
    
    # Handle different event types
    if event == "call_started":
        print(f"   Call started: {call_data['contact_name']} @ {call_data['company_name']}")
        return jsonify({"status": "logged"}), 200
    
    elif event == "call_ended":
        print(f"   Call ended: {call_data['disconnection_reason']}")
        print(f"   Duration: {call_data['duration_seconds']}s")
        
        # Check for meeting scheduling
        meeting_results = schedule_meeting_and_notify(call_data)
        if meeting_results["meeting_scheduled"]:
            print(f"   📅 Meeting scheduled!")
            print(f"   - Calendar: {'✅' if meeting_results['calendar_created'] else '❌'}")
            print(f"   - Email: {'✅' if meeting_results['email_sent'] else '❌'}")
            
            # Add meeting info to call_data for CRM update
            call_data["meeting_scheduled"] = True
            call_data["event_link"] = meeting_results.get("event_link", "")
        
        # Update CRM
        if update_crm_csv(call_data):
            return jsonify({
                "status": "crm_updated",
                "meeting": meeting_results
            }), 200
        else:
            return jsonify({
                "status": "no_match", 
                "warning": "Lead not found in CRM",
                "meeting": meeting_results
            }), 200
    
    elif event == "call_analyzed":
        print(f"   Analysis ready:")
        print(f"   - Successful: {call_data.get('call_successful')}")
        print(f"   - Sentiment: {call_data.get('user_sentiment')}")
        print(f"   - Summary: {call_data.get('transcript_summary', '')[:100]}...")
        
        # For analyzed events, also check for meeting scheduling
        # (in case meeting_datetime came through in analysis)
        meeting_results = schedule_meeting_and_notify(call_data)
        if meeting_results["meeting_scheduled"]:
            call_data["meeting_scheduled"] = True
            call_data["event_link"] = meeting_results.get("event_link", "")
        
        # Update CRM with analysis
        if update_crm_csv(call_data):
            return jsonify({
                "status": "analysis_logged",
                "meeting": meeting_results
            }), 200
        else:
            return jsonify({"status": "no_match"}), 200
    
    else:
        print(f"   Unknown event type: {event}")
        return jsonify({"status": "ignored", "event": event}), 200


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "crm_path": str(CRM_CSV_PATH),
        "crm_exists": CRM_CSV_PATH.exists()
    }), 200


def main():
    """Run the webhook server."""
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║     Retell Webhook Handler — CRM + Calendar + Email          ║
╠══════════════════════════════════════════════════════════════╣
║  Webhook URL: http://localhost:{WEBHOOK_PORT}/webhook/retell           ║
║  Health:      http://localhost:{WEBHOOK_PORT}/health                   ║
║  CRM Path:    {str(CRM_CSV_PATH)[:45]:<45} ║
║  Calendar:    {CALENDAR_ID:<45} ║
╠══════════════════════════════════════════════════════════════╣
║  Features:                                                   ║
║    ✅ CRM auto-update (stage, score, notes)                  ║
║    📅 Google Calendar event creation (meeting booked)        ║
║    📧 Dynamic one-pager email (call context + ESG toolkit)   ║
╠══════════════════════════════════════════════════════════════╣
║  For public access, use ngrok:                               ║
║    ngrok http {WEBHOOK_PORT}                                         ║
║  Then set the ngrok URL in Retell Dashboard > Webhooks       ║
╚══════════════════════════════════════════════════════════════╝
    """)
    
    if not os.environ.get("RETELL_API_KEY"):
        print("⚠️  WARNING: RETELL_API_KEY not set. Signature verification disabled.\n")
    
    app.run(host="0.0.0.0", port=WEBHOOK_PORT, debug=True)


if __name__ == "__main__":
    main()
