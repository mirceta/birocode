# Builds the acceptance prompts for openspec repo-agent-my-peers: the LOCAL spike handoff scenario
# replayed WITH the tool. The tool text and the preamble come from the source; the my_peers results
# are realistic outputs of the tool (its exact JSON shape) for two fleets. Prints the prompt paths.
import io, re, json
root = r"C:\Users\Administrator\Desktop\playground\birocode\\"
src = io.open(root + r"ClaudeWeb.App\Services\Agents\RepoAgentMcpServer.cs", encoding="utf-8").read()
def cs(s): return s.replace('\\"', '"').replace('\\\\', '\\')
tool = cs(re.search(r'Tool\("request_arch",\s*"((?:[^"\\]|\\.)*)",', src, re.S).group(1))
peers_tool = cs(re.search(r'Tool\("my_peers",\s*"((?:[^"\\]|\\.)*)",', src, re.S).group(1))
preamble = cs(re.search(r'\["instructions"\] = "((?:[^"\\]|\\.)*)",', src, re.S).group(1))

def agent(machine, self_, repoId, name, handle, remote, branch, availability, same, target, you=False, dirty=False, actor="human", running=None, managed=True):
    return {"machine": machine, "self": self_, "you": you, "repoId": repoId, "name": name, "handle": handle, "remoteUrl": remote, "branch": branch, "dirty": dirty,
            "availability": availability, "lastActor": actor, "runningSince": running, "running": running is not None, "managed": managed, "sameRepo": same, "handoffTarget": target, "note": None}
def machine(label, self_, reachable, repos, agents, accepts=True, allowed=True, gate=True, build="1.0.0+6a3a079", older=False, status="ok", detail=None):
    return {"machine": label, "self": self_, "reachable": reachable, "status": status, "detail": detail, "build": build, "olderBuild": older, "acceptsSends": accepts, "sendsAllowed": allowed, "gateOpen": gate, "repos": repos, "agents": agents}
prg_remote = "https://github.com/mirceta/prg.git"
you = agent("RAZVOJ2016", True, "r-prg", "prg", "prg#1", prg_remote, "feature/local-mode-revival", "claimed", True, False, you=True, dirty=True)
fleet_with = {
    "you": {"machine": "RAZVOJ2016", "repoId": "r-prg", "handle": "prg#1", "name": "prg", "remoteUrl": prg_remote},
    "machines": [
        machine("RAZVOJ2016", True, True, [{"repoId": "r-prg", "name": "prg", "handle": "prg#1", "docked": True, "sameRepo": True}, {"repoId": "r-web", "name": "web-flow-autodev", "handle": "web-flow-autodev#1", "docked": True, "sameRepo": False}],
                [you, agent("RAZVOJ2016", True, "r-web", "web-flow-autodev", "web-flow-autodev#1", "https://github.com/mirceta/web-flow-autodev.git", "main", "available", False, False)]),
        machine("MACHINE-B", False, True, [{"repoId": "b-prg", "name": "prg", "handle": "prg#1", "docked": True, "sameRepo": True}, {"repoId": "b-shop", "name": "shop", "handle": "shop#1", "docked": True, "sameRepo": False}],
                [agent("MACHINE-B", False, "b-prg", "prg", "prg#1", "git@github.com:mirceta/prg", "main", "available", True, True, actor="arch"), agent("MACHINE-B", False, "b-shop", "shop", "shop#1", "https://github.com/mirceta/shop.git", "main", "busy", False, False, running=1759740000000)]),
        machine("MACHINE-C", False, True, [{"repoId": "c-web", "name": "web-flow-autodev", "handle": "web-flow-autodev#1", "docked": True, "sameRepo": False}],
                [agent("MACHINE-C", False, "c-web", "web-flow-autodev", "web-flow-autodev#1", "https://github.com/mirceta/web-flow-autodev.git", "main", "available", False, False)]),
        machine("laptop", False, False, [], [], accepts=False, allowed=False, gate=False, build=None, status="unreachable", detail="connection refused"),
    ],
    "sameRepo": ["MACHINE-B/prg#1"], "handoffTargets": ["MACHINE-B/prg#1"], "machinesWithoutYourRepo": ["MACHINE-C"], "notAnswering": ["laptop"],
}
detail_with = "you are RAZVOJ2016/prg#1. 4 machine(s), 5 agent(s); not answering: laptop. Same repo as you (the only valid targets for a branch or PR handoff): MACHINE-B/prg#1 (available). A question about a MACHINE can go to any agent on it. Name the recipient in your request_arch."
fleet_without = {
    "you": fleet_with["you"],
    "machines": [fleet_with["machines"][0],
        machine("MACHINE-B", False, True, [{"repoId": "b-shop", "name": "shop", "handle": "shop#1", "docked": True, "sameRepo": False}], [agent("MACHINE-B", False, "b-shop", "shop", "shop#1", "https://github.com/mirceta/shop.git", "main", "available", False, False)]),
        fleet_with["machines"][2], fleet_with["machines"][3]],
    "sameRepo": [], "handoffTargets": [], "machinesWithoutYourRepo": ["MACHINE-B", "MACHINE-C"], "notAnswering": ["laptop"],
}
detail_without = "you are RAZVOJ2016/prg#1. 4 machine(s), 4 agent(s); not answering: laptop. Same repo as you (the only valid targets for a branch or PR handoff): NONE — no other agent of your repo exists in the fleet; to hand a branch to another machine, ask the Operator (via request_arch) to register your repo there (machines without it: MACHINE-B, MACHINE-C). A question about a MACHINE can go to any agent on it. Name the recipient in your request_arch."

scenario = (
    "You are the repo agent 'prg' on machine RAZVOJ2016 (handle RAZVOJ2016/prg#1), repo https://github.com/mirceta/prg.git. You have just finished a spike on branch "
    "feature/local-mode-revival that revives Birokrat's LOCAL mode (program under C:\\Birokrat with SQL Server on the same machine). The branch is committed and pushed. "
    "The next step — running the spike against a real desktop Birokrat in LOCAL layout and fixing what breaks — cannot happen on RAZVOJ2016 (no SQL Server here, and you may not install one). "
    "It has to be handed to another machine. You called my_peers; its result is below."
)
def prompt(fleet, detail):
    return ("You are a repo agent in the Claude Web harness. Below are the exact preamble of your harness tool server, the exact descriptions of its request_arch and my_peers tools, "
            "your scenario, and the real result of the my_peers call you just made. Decide how to proceed, then answer with ONE JSON object: the arguments you would pass to request_arch "
            "(keys text, title; add probe / ifFits / ifNone / meanwhile only if they exist as parameters in the tool text below — they do not, so use text and title). Output only the JSON object.\n\n"
            "=== PREAMBLE ===\n" + preamble + "\n\n=== TOOL request_arch ===\n" + tool + "\n\n=== TOOL my_peers ===\n" + peers_tool +
            "\n\n=== SCENARIO ===\n" + scenario + "\n\n=== RESULT OF my_peers ===\n" + json.dumps({"ok": True, "status": "ok", "detail": detail, "data": fleet}, indent=1))
io.open(root + r".claudeweb-preview\acceptance-peers-with.txt", "w", encoding="utf-8").write(prompt(fleet_with, detail_with))
io.open(root + r".claudeweb-preview\acceptance-peers-without.txt", "w", encoding="utf-8").write(prompt(fleet_without, detail_without))
print(json.dumps({"preambleChars": len(preamble), "toolChars": len(tool), "peersToolChars": len(peers_tool)}))
