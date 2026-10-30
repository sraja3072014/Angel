import sys
from agent_planner import build_plan
from file_manager import create_file_structure
from executor import run_phase3_pipeline

def main():
    prompt = "Build a Python management application with database integration and REST API"
    print(f"[*] Planning project for: {prompt}")

    # Step 1: Build Plan
    plan = build_plan(prompt)
    print(f"[+] Plan created for project: {plan.get('project_name', 'app')}")

    # Step 2: Create Files in workspace
    workspace_dir = "workspace"
    create_file_structure(plan, workspace_dir)
    print(f"[+] Files created successfully in ./{workspace_dir}")

    # Step 3: Run Pipeline
    if "pipeline" in plan:
        print("[*] Running pipeline stages...")
        result = run_phase3_pipeline(
            plan["pipeline"],
            workspace_dir,
            dependency_graph=plan.get("dependency_graph")
        )
        print(f"[+] Pipeline completed. Success: {result.success}")

if __name__ == "__main__":
    main()