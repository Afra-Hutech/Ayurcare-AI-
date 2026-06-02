import json
from bot import diagnose

def test_consolidated_report():
    print("Testing Consolidated Report Generation...")
    
    # Mock data
    symptoms = ["chronic bloating", "low appetite", "heavy feeling after meals"]
    history = [
        "User: Hello, I have been feeling very bloated lately.",
        "AI: I'm sorry to hear that. How long has this been happening?",
        "User: For about 2 months now. It's worse after I eat heavy meals.",
        "AI: Do you also feel heavy or lethargic?",
        "User: Yes, especially in the mornings.",
        "AI: Thank you. What is your age and gender?",
        "User: I am 35, male. I sit at a desk all day."
    ]
    
    print("Running diagnosis (this may take a few moments as it calls the LLM multiple times)...")
    result = diagnose(symptoms, history)
    
    if not result:
        print("❌ FAILED: No result from diagnose()")
        return
        
    # Extract JSON part
    if "---REPORT_DATA---" in result:
        parts = result.split("---REPORT_DATA---")
        chat_summary = parts[0].strip()
        payload_str = parts[1].strip()
        
        try:
            payload = json.loads(payload_str)
            print("\n[SUCCESS] Payload is valid JSON")
            
            reports = payload.get("reports", [])
            print(f"Number of reports generated: {len(reports)}")
            
            # Print all reports types and their keys for verification
            print("\n--- REPORT KEY VERIFICATION ---")
            for idx, r in enumerate(reports):
                r_type = r.get('reportType')
                r_keys = list(r.get('reportData', {}).keys())
                print(f"Report {idx} [{r_type}]: {r_keys}")
            print("-------------------------------\n")
            
            # Check for Master Report
            master = next((r for r in reports if r.get("reportType") == "Master Report"), None)
            if master:
                print("[SUCCESS] Master Report found")
                data = master.get("reportData", {})
                print(f"Master KPIs: {len(data.get('master_kpis', []))}")
                print(f"Master Pain Points: {len(data.get('master_pain_points', []))}")
            else:
                print("[FAILED] Master Report missing")
                
            # Check for Specialty reports
            for r_type in ["Root Cause Report", "Lifestyle Report", "Treatment Plan Report", "Risk Report"]:
                r = next((report for report in reports if report.get("reportType") == r_type), None)
                if r:
                    print(f"[SUCCESS] {r_type} found")
                else:
                    print(f"[FAILED] {r_type} missing")

            # Check for redundancy
            lifestyle = next((r for r in reports if r.get("reportType") == "Lifestyle Report"), None)
            if lifestyle:
                l_data = lifestyle.get("reportData", {})
                if "kpis" in l_data and len(l_data["kpis"]) > 0:
                    print("[WARNING] Redundancy found! Lifestyle report still contains KPIs.")
                else:
                    print("[SUCCESS] Lifestyle report is clean of redudant KPIs.")
            
            print(f"\nChat Summary Preview: {chat_summary[:200]}...")
            
        except json.JSONDecodeError:
            print("[FAILED] Invalid JSON in report data")
    else:
        print("[FAILED] delimiter ---REPORT_DATA--- missing from output")

if __name__ == "__main__":
    test_consolidated_report()
