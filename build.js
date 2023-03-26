#! deno run --allow-all --unstable
import * as JSONC from "https://deno.land/std/encoding/jsonc.ts";

async function fileExists(filepath) {
    try {
        const file = await Deno.stat(filepath);   
        return file.isFile();
    } catch (e) {
        return false
    }
}

async function execute(v) {
    const p = Deno.run({
        cmd: v
    });
    const { success, code } = await p.status();
    let result = {};
    result.success = success;
    result.code = code;
    return result;
}

async function executePipe(v) {
    const p = Deno.run({
        cmd: v,
        stdout: "piped",
        stderr: "piped",
    });
    const { success, code } = await p.status();
    let result = {};
    result.success = success;
    result.code = code;
    const rawOutput = await p.output();
    result.stdout = new TextDecoder("shift-jis").decode(rawOutput);
    const rawError = await p.stderrOutput();
    result.stderr = new TextDecoder("shift-jis").decode(rawError);
    return result;
}

let cwd = Deno.cwd();

await execute(["gh", "auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"]);

let buildDir = cwd + "\\tmp";
Deno.mkdir(buildDir, { recursive: true });

async function scoopAppInfo(rec /*key, path*/) {
    await execute(["cmd.exe", "/c", "scoop", "install", rec.name]);
    await execute(["cmd.exe", "/c", "scoop", "update", rec.name]);
    let st = await executePipe(["scoop-console-x86_64-static.exe", "--latest", rec.name]);
    let list = st.stdout.trim().split(" ");
    let version = list[0];
    let dir = list[1];
    let url = `https://github.com/java-wrap/jre/releases/download/64bit/${rec.name}-${version}.zip`;
    st = await executePipe(["curl.exe", url, "-o", "/dev/null", "-w", "%{http_code}", "-s"]);
    return { "name": rec.name, "path": rec.path, "version": version, "dir": dir, "url": url, "script": rec.script, "exists": st.stdout != "404" };
}

await execute(["cmd.exe", "/c", "scoop", "install", "git"]);
await execute(["cmd.exe", "/c", "scoop", "bucket", "add", "main"]);
await execute(["cmd.exe", "/c", "scoop", "bucket", "add", "extras"]);
await execute(["cmd.exe", "/c", "scoop", "bucket", "add", "java"]);

//let programs = JSONC.parse(await Deno.readTextFile('programs.json.new'));

let result = [];

let programs = [
  { "name": "zulu17-jre", "path": "/bin" }
];

for (var rec of programs)
{
	console.log(rec);
    let app = await scoopAppInfo(rec /*rec.name, rec.path*/);
    console.log(app);
    let url_parts = app.url.split(".");
    let ext = url_parts[url_parts.length - 1];
    result.push({ "name": app.name, "version": app.version, "path": app.path, "url": app.url, "ext": ext, "script": app.script });
    //if (!app.exists)
    {
        await execute(["cp", cwd + "/jwrap.conf.xml", app.dir + "/"]);
        Deno.chdir(app.dir);
        await execute(["cmd.exe", "/c", "dir"]);
        let archive = buildDir + `/${app.name}-${app.version}.zip`;
        if (!await fileExists(archive)) await execute(["7z.exe", "a", "-r", "-tzip", "-mcu=on", archive, "*"]);
        console.log("(1)");
        Deno.chdir(cwd);
        console.log("(2)");
        await execute(["gh.exe", "release", "upload", "64bit", archive]);
        console.log("(3)");
    }
}
Deno.chdir(cwd);
Deno.writeTextFile("00-software.json", JSON.stringify({ "software" : result }, null, 2));
await execute(["gh.exe", "release", "upload", "64bit", "software.json", "--clobber"]);
