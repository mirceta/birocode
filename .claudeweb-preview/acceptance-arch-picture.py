# Builds the two acceptance prompts for openspec repo-agent-arch-picture from the SOURCE texts
# (the preamble constant and the request_arch tool description in RepoAgentMcpServer.cs), so
# what the model is given is exactly what a fresh repo agent gets. Prints the prompt paths.
import io, re, json
root = r"C:\Users\Administrator\Desktop\playground\birocode\\"
src = io.open(root + r"ClaudeWeb.App\Services\Agents\RepoAgentMcpServer.cs", encoding="utf-8").read()

def cs_string(s):
    # unescape the C# literal: \" → ", \\ → \
    return s.replace('\\"', '"').replace('\\\\', '\\')

pic = re.search(r'public const string ArchPicture =\s*"((?:[^"\\]|\\.)*)";', src, re.S).group(1)
tool = re.search(r'Tool\("request_arch",\s*"((?:[^"\\]|\\.)*)",', src, re.S).group(1)
pic, tool = cs_string(pic), cs_string(tool)
preamble_tail = re.search(r'\["instructions"\] = ArchPicture \+ " " \+ "((?:[^"\\]|\\.)*)",', src, re.S).group(1)
preamble = pic + " " + cs_string(preamble_tail)

scenario = (
    "You are the repo agent 'prg' on machine RAZVOJ2016 (handle RAZVOJ2016/prg#1), working on branch feature/invoice-import of a desktop ERP "
    "called Birokrat. Your task needs a Microsoft SQL Server with the Birokrat databases restored in LOCAL layout (the program installed under C:\\Birokrat "
    "with its databases on the same machine) to run and verify a migration. This machine has no SQL Server and you may not install one here. "
    "Your migration script is written and committed on the branch; it is not yet pushed."
)

p1 = (
    "You are a repo agent in the Claude Web harness. Below is the exact preamble of your harness tool server and the exact description of its request_arch tool. "
    "Read them, then act on the scenario by answering with ONE JSON object: the arguments you would pass to request_arch — keys text, title, probe, ifFits, ifNone, meanwhile "
    "(omit any you would leave empty). Output only the JSON object, nothing else.\n\n"
    "=== PREAMBLE ===\n" + preamble + "\n\n=== TOOL request_arch ===\n" + tool + "\n\n=== SCENARIO ===\n" + scenario
)
p2 = (
    "You are a repo agent in the Claude Web harness. Below is the exact preamble of your harness tool server. Read it, then answer the prompt that just arrived in your dock. "
    "Answer in at most 6 lines of plain text — exactly what you would send back. State what you checked (name the commands you would run) and what you found; "
    "assume the checks show: SQL Server 2019 Express is installed and running, databases BIROKRAT_MAIN and BIROKRAT_TEST exist, and C:\\Birokrat holds the Operator's daily-use install "
    "with uncommitted local settings.\n\n"
    "=== PREAMBLE ===\n" + preamble + "\n\n=== PROMPT IN YOUR DOCK (tagged arch@spacex) ===\n"
    "Probe on behalf of RAZVOJ2016/prg#1: do you have SQL Server with the Birokrat databases restored on your machine, and is it safe to change C:\\Birokrat there to run a migration on branch feature/invoice-import? Answer short and factual."
)
io.open(root + r".claudeweb-preview\acceptance-prompt-request.txt", "w", encoding="utf-8").write(p1)
io.open(root + r".claudeweb-preview\acceptance-prompt-probe.txt", "w", encoding="utf-8").write(p2)
print(json.dumps({"preambleChars": len(preamble), "toolChars": len(tool)}))
