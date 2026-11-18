# Install the AI Architect on macOS

AI ServiceNow Architect · macOS 13.5 or later (see "What you need"), on a Mac with Apple silicon or an Intel processor · two paths: with your Mac's administrator password, or on a company Mac without it · not yet tested end to end on a Mac (see "What has not been tested")

This guide takes you from a Mac with nothing installed to a working AI Architect connected to your ServiceNow instance. Follow it from top to bottom. Plan about half an hour, more if your Mac first has to download Apple's Command Line Tools; most of it is waiting. On path B, add the time your IT team needs for 2a.

## What you need

- A Mac with **macOS 13.5 or later**, connected to the internet: Claude Code needs 13.0, Node.js 26 needs 13.5. To see your version, open the Apple menu and choose **About This Mac**. If it shows an older version, update macOS first, through Software Update; on a company Mac, ask your IT team.
- **Which chip your Mac has**, if you follow path B. The same window shows an item labelled **Chip** on a Mac with Apple silicon, and an item labelled **Processor** on a Mac with an Intel processor. On path B the Node.js download differs between the two (2b).
- At least **2 GB of free disk space** once the programs of Step 2 are installed: the installer checks for 1.5 GB in Step 6a. Apple's Command Line Tools (if your Mac does not have them yet), Node.js, Claude Code and draw.io need room of their own before that. The ServiceNow documentation that the Architect reads takes about 490 MB.
- A **paid Claude plan**: Pro, Max, Ultra, Team or Enterprise, or a Claude Console account. The free plan does not include Claude Code.
- Your **licence file**: a small file named like `LIC-2026-0000.json`, saved in your **Downloads** folder. For live mode it must be a licence for live: whoever gave it to you knows which one you have.
- For a connection to ServiceNow (live mode): the **address of your instance** and a **user name and password** for it. On a personal developer instance (PDI) this is the `admin` user.
- For the programs in Step 2, one of these two, depending on your path:
  - **Path A:** your Mac's **administrator password**, the one macOS may ask for when you install a program.
  - **Path B:** your **IT team's help, once**, or your company's **Self Service** app, for Apple's Command Line Tools. Everything else on path B installs into your home folder without any password.

## How to use this guide

- After the word **Run** comes a grey box with exactly **one** command. Copy it (with its Copy button, or select it and press **Command+C**), click inside the Terminal window, paste with **Command+V** and press **Return**.
- After the words **On screen** comes a grey box that shows what you will see. You do not type those.
- Wait until the line that ends in `%` comes back before you run the next command. (If your Terminal uses bash, which Step 1 checks, the line ends in `$` instead.)
- Parts headed **Path A** or **Path B** are for one path only; Step 2 explains both. Commands marked **Apple silicon** or **Intel** are for one kind of Mac, and commands marked **zsh** or **bash** are for one shell (Step 1). Run only the one that fits your Mac.
- Where a command contains the label `pdi`, use your own instance label (wizard question 1).
- To change part of a command, paste it but do not press **Return** yet. Press the **left arrow** key until the cursor (the mark where your typing goes) is just after the part to change, press **delete** until that part is gone, type yours, then press **Return**.
- The installer's own screens say *Enter*. On a Mac that is the **Return** key.
- Type with an English (Latin) keyboard layout: the keys you type by hand (`1`, `2`, `q`, `/exit`, your label) must arrive as Latin letters. If you use another alphabet, switch the input source in the menu bar first.
- This guide uses the English names of macOS menus and folders. On a Mac set to another language they appear translated; the commands stay the same.
- The screens in this guide are examples. Your version numbers, file counts, times, folders and free disk space differ.

> **Never paste several commands at once.** Paste one, press Return, wait, then the next. In our own test on Windows a pasted block of three lines arrived broken, and the computer asked a question nobody expected.

> **Something unexpected on the screen?** Do not press Return. Press **Control+C** (the control key and C together, not the command key) to cancel, then look it up in "If something goes wrong" at the end of this guide.

## Step 1 · Open Terminal

Terminal is the window where you type the commands in this guide.

1. Press **Command+Space** (the command key and the space bar together). The Spotlight search field opens.
2. Type `Terminal` and press **Return**.
3. Look at the line where you type. It shows your user name, the name of your Mac and `~`, and it ends in `%`. The `~` stands for your home folder, the folder with your user name.

If Spotlight does not open, use Finder instead: open **Applications**, then **Utilities**, and double-click **Terminal**.

On screen:

```
you@MacBook-Air ~ %
```

### Which shell your Terminal uses

The program inside Terminal that reads your commands is called the shell. A Mac account made on macOS 10.15 or later uses **zsh** unless someone changed it; an account first made on an older Mac may still use **bash**. A few commands in this guide differ between the two, so check once. This command only reads.

Run:

```
echo $0
```

If the answer contains `zsh`, use the commands marked **zsh**. If it contains `bash`, use the commands marked **bash**. A line at the top of the window saying that the default interactive shell is now zsh also means that this window uses bash. That message is harmless. Do not follow any instruction in it to change your shell: this guide gives the bash commands where they differ.

**If your shell is bash**, run this check once before Step 2. It only reads.

**bash**. Run:

```
ls ~/.bash_profile ~/.bash_login ~/.profile
```

A file that exists is listed by its name, for example `/Users/you/.profile`; a file that does not exist gets a line that ends in `No such file or directory`. If `.bash_profile` does not exist but `.bash_login` or `.profile` does, stop here and ask for help before Step 2: send this answer to whoever helps you with the AI Architect. The bash commands of this guide would make a `.bash_profile`, and bash would then stop reading your existing file. In every other case, carry on.

## Step 2 · Install the programs

You need three programs (Git, Node.js and Claude Code), plus draw.io Desktop for the diagrams in your Word documents (2f). You install them once per Mac. Each download command fetches one file from that program's official site.

### Path A or path B: choose yours first

There are two ways to install the programs. Choose the one that fits your Mac, and follow only its parts of 2a, 2b and 2f. 2c, 2d and 2e are the same for both paths, and so is everything from Step 3 on.

| | Path A | Path B |
|---|---|---|
| Choose it when | **"I can type my Mac's administrator password."** | **"My Mac is managed by my company; I cannot install programs myself."** |
| Git (2a) | Apple's Command Line Tools, installed with one command | Apple's Command Line Tools, installed once by your IT team or from your company's Self Service app |
| Node.js (2b) | The official Node.js installer | The official Node.js archive, unpacked into your home folder, with no password |
| draw.io (2f) | Into the Mac's Applications folder | Into an Applications folder inside your home folder, with no password |

Not sure? Choose path A if you know a name and password that this Mac accepts when you install a program, even on a company Mac. Otherwise choose path B, for example on a company Mac where only your IT team installs programs.

> **No Homebrew, no sudo.** This guide does not use Homebrew. If a message from the AI Architect suggests `brew install …`, install that program as in this step instead: Git in 2a, Node.js in 2b, draw.io in 2f. No command in this guide starts with `sudo`, and you should never put `sudo` in front of one: the command would run with the administrator's rights, and the files it makes may not be changeable from your own account later.

### 2a · Git (Apple's Command Line Tools)

Git downloads the AI Architect and keeps it up to date. On a Mac, Git comes with Apple's Command Line Tools, also called the Xcode Command Line Tools.

#### Path A · Install the Command Line Tools

Run:

```
xcode-select --install
```

A window from macOS offers to install the command line developer tools. In Terminal the line that ends in `%` may come back at once: the install goes on in that window, so wait for the window, not for Terminal. Click **Install** and accept the licence agreement. If macOS asks for a password, type your Mac's administrator password. The download can take a while: wait until the window says that the software was installed, then click **Done**.

If Terminal answers instead with a line saying that the command line tools are already installed (it may start with `xcode-select: error:`, which is harmless here), they are on your Mac already. Go on to 2b.

#### Path B · Get the Command Line Tools once

On a company Mac, installing the Command Line Tools may need an administrator, once. First check whether your Mac has them already. This command changes nothing; on a Mac without the tools it may open a window that offers to install them.

Run:

```
git --version
```

- If it answers with a line that starts with `git version`, Git is there. Go on to 2b.
- If a window opens that offers to install the command line developer tools, or Terminal answers with an error, they are not there yet. Ask your IT team to install **Apple's Command Line Tools** (Xcode Command Line Tools) on this Mac, or install them yourself from your company's **Self Service** app if it lists them. You may also click **Install** in that window: if macOS then asks for an administrator's name and password that you do not have, click **Cancel** and ask your IT team. Once the tools are installed, run `git --version` again. While you wait for your IT team, you can already do 2b, 2c, 2d and 2f; do 2e and the steps after it once `git --version` answers with a version.

### 2b · Node.js

Runs the part of the AI Architect that talks to your ServiceNow instance. First make a folder for the files this guide downloads (both paths). It prints nothing.

Run:

```
mkdir -p ~/snowarch-dl
```

The folder is `snowarch-dl` in your home folder. It holds only downloaded files; you can move it to the Trash once the install is done and 2f has worked.

The download commands of 2b and 2f show a small table of numbers while they work. Wait until the line that ends in `%` comes back.

#### Path A · The Node.js installer

This release of Node.js has one installer file for Macs. Download it:

Run:

```
curl -fL -o ~/snowarch-dl/node.pkg https://nodejs.org/dist/v26.13.1/node-v26.13.1.pkg
```

Then open it. (Or, in Finder, choose **Go › Home** in the menu bar, open the folder `snowarch-dl` and double-click `node.pkg`.)

Run:

```
open ~/snowarch-dl/node.pkg
```

The Node.js installer opens in its own window. Follow its screens to the end and keep the choices it proposes. If macOS asks for a password, type your Mac's administrator password. If its last screen asks you to make sure that a folder is on your PATH, you need not do anything: 2e checks it. Then close the installer. There is no PATH command to run on this path: 2e checks that a fresh window finds `node` and `npm`.

#### Path B · Node.js in your home folder

This is the archive version, which needs no installer and no password. Download the file for your Mac's chip (see "What you need"). Run one of these two.

**Apple silicon** (About This Mac shows *Chip*). Run:

```
curl -fL -o ~/snowarch-dl/node.tar.gz https://nodejs.org/dist/v26.13.1/node-v26.13.1-darwin-arm64.tar.gz
```

**Intel** (About This Mac shows *Processor*). Run:

```
curl -fL -o ~/snowarch-dl/node.tar.gz https://nodejs.org/dist/v26.13.1/node-v26.13.1-darwin-x64.tar.gz
```

Make the folder Node.js goes into, `.local/node` in your home folder. It prints nothing.

Run:

```
mkdir -p ~/.local/node
```

Unpack Node.js into it. Wait until the line that ends in `%` comes back.

Run:

```
tar -xzf ~/snowarch-dl/node.tar.gz -C ~/.local/node --strip-components=1
```

Tell your Mac where Node.js is. Your Mac looks for commands in a list of folders called PATH (2d says more). This command adds the Node.js folder to that list for your account only, and applies it to this window. It is one long line; copy all of it. It normally prints nothing. Run only the one for your shell (Step 1).

**zsh**. Run:

```
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

**bash**. Run:

```
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.bash_profile && source ~/.bash_profile
```

### 2c · Claude Code

The AI assistant that the Architect runs in. The same command for both paths.

Run:

```
curl -fsSL https://claude.ai/install.sh | bash
```

It shows no progress while it downloads. When it has finished, it prints `Claude Code successfully installed!` and the line that ends in `%` comes back. Then read the *Setup notes* it prints at the end, but do not copy the commands they show: 2d gives you the same fix as one command.

> **Two folders called .local.** Claude Code has just put itself into `~/.local`, a folder in your home folder; on path B, Node.js is there too (2b). The `.local` inside your AI-Arch folder (Step 5) is a different folder: it holds your licence and your saved password. Never delete `~/.local`: Claude Code, and on path B Node.js, would go with it.

### 2d · Tell your Mac where Claude Code is

Your Mac looks for commands in a list of folders called **PATH**. The Claude Code installer puts `claude` in the folder `.local/bin` of your home folder, and it may not add that folder to the list: then Terminal answers `zsh: command not found: claude`, even in a new window. This command adds the folder for your account only, and applies it to this window. It is one long line; copy all of it. It normally prints nothing. The AI Architect's installer prints this same command if it ever finds Claude Code installed but its folder not on PATH.

If the *Setup notes* of 2c said `Native installation exists but ~/.local/bin is not in your PATH.`, this is the step that fixes it. Run it in any case. Run only the one for your shell (Step 1).

**zsh**. Run:

```
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

**bash**. Run:

```
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bash_profile && source ~/.bash_profile
```

For bash, the check in Step 1 applies. If a command answers `permission denied`, see "If something goes wrong".

### 2e · Open a fresh window and check

Quit Terminal (in the menu bar, choose **Terminal › Quit Terminal**) and open it again as in Step 1, so that it sees the new programs. Then run these four commands, one at a time.

Run:

```
claude --version
```

Run:

```
git --version
```

Run:

```
node --version
```

Run:

```
npm --version
```

On screen (examples; the numbers on your Mac differ):

```
2.1.322 (Claude Code)
git version 2.39.5 (Apple Git-146)
v26.13.1
```

The last command answers with npm's own version number.

| Program | You need at least |
|---|---|
| Claude Code | 2.1.214 |
| Git | 2.34.1 |
| Node.js | v20. Step 2b installs v26.13.1. The AI Architect is tested with Node.js 20, 22, 24 and 26 on Windows, macOS and Linux. |
| npm | Any version. It comes with Node.js. |

If one of them answers `command not found`, see "If something goes wrong".

If a number is lower than the table says, do not continue: ask for help, and send these four answers. For git, a number below 2.34.1 means that Apple's Command Line Tools on this Mac are old; on path B, your IT team can install their newest version.

### 2f · draw.io Desktop (for the diagrams)

The AI Architect draws its diagrams in draw.io and turns them into pictures for your Word documents. Without draw.io Desktop on this Mac it stops with `ERROR: draw.io Desktop not found` and cannot make the Word file. draw.io renders on your own Mac; nothing about your diagrams is sent anywhere.

draw.io is needed only for those diagrams. If a download in 2f fails, carry on with Step 3 and come back to 2f later: the installer does not need draw.io.

If you have moved the folder `snowarch-dl` to the Trash since 2b, run the first command of 2b again first.

Download the disk image (both paths). The universal file is for both kinds of Mac, Apple silicon and Intel. It is about 260 MB.

Run:

```
curl -fL -o ~/snowarch-dl/drawio.dmg https://github.com/jgraph/drawio-desktop/releases/download/v32.7.4/draw.io-universal-32.7.4.dmg
```

#### Path A · Into Applications

Open the disk image:

Run:

```
open ~/snowarch-dl/drawio.dmg
```

A Finder window opens with **draw.io** in it. Drag **draw.io** onto the **Applications** folder, in that window or in the Finder sidebar. If macOS asks for a password, type your Mac's administrator password. Wait until Finder has finished copying, then check that the program is in place:

Run:

```
ls /Applications/draw.io.app/Contents/MacOS/draw.io
```

It must answer with that same path. If it answers `No such file or directory`, Finder has not finished copying, or draw.io went somewhere else: wait, drag **draw.io** onto **Applications** again, and run the check again. The AI Architect looks for draw.io there by itself, so there is no PATH command to run.

Open draw.io once yourself: in Finder, open **Applications** and double-click **draw.io**, so that any question from macOS comes up while you are watching. If macOS asks whether you want to open an app downloaded from the internet, click **Open**. Then quit draw.io (in the menu bar, **draw.io › Quit draw.io**), and eject the draw.io disk: click the eject button next to its name in the Finder sidebar.

#### Path B · Into your own Applications folder

Your home folder can have an Applications folder of its own, where you can put programs without a password. Make it; nothing happens if it is there already.

Run:

```
mkdir -p ~/Applications
```

Open the disk image:

Run:

```
open ~/snowarch-dl/drawio.dmg
```

Open your own Applications folder:

Run:

```
open ~/Applications
```

Two Finder windows are open now: one shows **draw.io**, the other your own Applications folder. Drag **draw.io** from the first into the second. If macOS asks for an administrator's name and password, you are dragging into the Mac's main Applications folder: click **Cancel** and drag into the window that the last command opened. Wait until Finder has finished copying, then check that the program is in place:

Run:

```
ls ~/Applications/draw.io.app/Contents/MacOS/draw.io
```

It must answer with that path, with your home folder written out: `/Users/you/Applications/draw.io.app/Contents/MacOS/draw.io`, with your own user name in place of `you`. If it answers `No such file or directory`, draw.io is not in your own Applications folder yet: wait for Finder to finish, drag **draw.io** into the window that `open ~/Applications` opened, and run the check again.

The AI Architect does not look in this folder by itself, so give it a small command named `drawio` that starts draw.io from there. This command makes that file in Claude Code's folder from 2d, which is already on PATH. It is one long line; copy all of it. It prints nothing when it works.

Run:

```
printf '#!/bin/sh\nexec "$HOME/Applications/draw.io.app/Contents/MacOS/draw.io" "$@"\n' > ~/.local/bin/drawio && chmod +x ~/.local/bin/drawio
```

Open draw.io once yourself: double-click **draw.io** in your own Applications folder, so that any question from macOS comes up while you are watching. If macOS asks whether you want to open an app downloaded from the internet, click **Open**. Then quit draw.io (in the menu bar, **draw.io › Quit draw.io**), and eject the draw.io disk: click the eject button next to its name in the Finder sidebar.

## Step 3 · Sign in to Claude Code

You do this once per Mac. First go to the download folder from 2b. It holds no files of yours, so Claude Code has nothing to look at while you sign in.

Run:

```
cd ~/snowarch-dl
```

Run:

```
claude
```

1. Claude Code opens a short first-time setup in the window. Choose any colour theme, then choose to sign in with your Claude account.
2. Your browser opens. Sign in with your Claude account and allow access. If the browser does not open, press `c` in Terminal: it copies the sign-in address, which you then paste into your browser.
3. Go back to Terminal. If Claude Code asks whether you trust this folder, answer **Yes**.
4. Type `/exit` and press **Return**. You are back at the line that ends in `%`.

On a Mac, Claude Code keeps your sign-in in your login keychain.

## Step 4 · Download the AI Architect

This puts the AI Architect in a folder named `AI-Arch` directly in your home folder: `/Users/<you>/AI-Arch`, or `~/AI-Arch` for short. Run the three commands one at a time.

Run:

```
cd ~
```

Run:

```
git -c advice.detachedHead=false clone --branch v2.2.6 https://github.com/farstic/snowarch.git AI-Arch
```

Run:

```
cd AI-Arch
```

On screen:

```
Cloning into 'AI-Arch'...
remote: Enumerating objects: 814, done.
...
Resolving deltas: 100% (255/255), done.
you@MacBook-Air ~ % cd AI-Arch
you@MacBook-Air AI-Arch %
```

Your line should now show `AI-Arch` before the `%`. Some versions of git also print `warning: refs/tags/... is not a commit!`. It is harmless.

> **Why this folder.** The installer keeps your ServiceNow password in a file inside this folder (`.local/instances.json`) and makes that file, and the folder `.local` around it, readable only by your account (file mode 0600, folder mode 0700). It does this in whatever folder you choose, and the wizard says so when it saves. This guide puts the folder directly in your home folder, for three reasons. **Not in Desktop or Documents:** a Mac can keep those two folders in iCloud Drive, and then your password file would be copied to iCloud with them. The AI Architect warns when its folder is inside iCloud Drive, OneDrive, Dropbox or Google Drive, but it cannot tell when Desktop or Documents are kept in iCloud. **Not in Desktop, Documents or Downloads:** macOS guards these folders and can ask whether Terminal may use the files in them. **No spaces in the name:** a folder name with a space in it has not been tested, and every command that names it would need quotation marks. If you prefer another folder, use its name in these commands and in "Every day".

If git says the folder *already exists*, you already have a copy. Either continue with Step 5 in that folder, or pick another name and use it in both of the last two commands.

## Step 5 · Add your licence

Put the licence in place **before** you run the installer, so the install checks it together with everything else. Without a licence the installer leaves out two of its steps, the instance wizard (6d) and the verify step that follows it, until you run it again with the licence in place. All commands run in the `AI-Arch` folder.

### 5a · Make the folder for it

Run:

```
mkdir -p .local
```

It prints nothing. This is the `.local` inside your AI-Arch folder, not the `~/.local` in your home folder from Step 2.

### 5b · Find the exact name of your licence file

Run:

```
ls ~/Downloads/LIC-*.json
```

On screen (example):

```
/Users/you/Downloads/LIC-2026-0000.json
```

The file's name is the last part, for example `LIC-2026-0000.json`. It must list exactly one file. If it lists more than one, move the ones you do not need from Downloads to the Trash, then run this command again.

> **macOS may ask whether Terminal may access files in your Downloads folder.** Click **OK** or **Allow**, whichever the window shows. If you clicked *Don't Allow*, or the command answers *Operation not permitted*, allow it afterwards. Choose Apple menu › System Settings and click **Privacy & Security** in the sidebar. Click **Files & Folders**, and turn on Terminal's access to the Downloads folder. If that switch is missing or cannot be turned on, your company sets it: ask your IT team. Then quit Terminal, open it again, go back into your folder with `cd ~/AI-Arch`, and run this command again.

If it answers *no matches found* or *No such file or directory*, open your Downloads folder in Finder. If the licence file is not there, save it there, or ask for it. If it is there, macOS is not letting Terminal into Downloads, and does not always say so: allow it as in the box above. Then run this command again.

### 5c · Copy it into place

This copies the licence file that 5b found, whatever its exact name, so you need not change anything in the command. It prints nothing when it works.

Run:

```
cp ~/Downloads/LIC-*.json .local/licence.json
```

If it answers with an error, run 5b again: it must list exactly one file.

> **The name must be exactly licence.json**, spelled with a **c**, the British way. A file called `license.json`, or one that keeps its original name, is not read.

## Step 6 · Run the installer

Run:

```
./bootstrap.sh
```

The installer works in four parts: it checks your Mac, shows a plan, downloads what it needs, and asks seven questions about your ServiceNow instance. Each part is explained below, in the order you will see it.

### 6a · It checks your Mac

On screen:

```
ok B00 root: /Users/you/AI-Arch
ok B00 git: 2.39.5
ok B00 claudeCode: 2.1.322 · login: ok
ok B00 disk: 104.9 GB free
ok B00 network: github.com reachable (HTTP 200)
ok B00 node: 26.13.1 · npm 11.20.0
ok B00 platform: darwin arm64 25.6.0
[B00/09] preflight … ok (2 s)
```

| Line | What it checks |
|---|---|
| root | You started the installer from inside the AI Architect folder. |
| git | Git is installed and new enough. |
| claudeCode | Claude Code is installed and new enough; `login: ok` means you are signed in (Step 3). |
| disk | There is enough free space. |
| network | Your Mac can reach github.com, where the installer downloads the ServiceNow documentation from. |
| node | Node.js and its helper npm are installed. |
| platform | Your Mac's system and chip: `darwin` is the core of macOS, `arm64` an Apple silicon chip and `x64` an Intel processor. The number is the version of that core, not your macOS version. Shown for information. |

Every line should start with `ok`, and the node line must show a version number.

- A line that starts with `FAIL` stops the installer, and the `Remedy:` line under it says what to do. Do it, then run `./bootstrap.sh` again; it continues from where it stopped. If the remedy suggests `brew install …`, install that program as in Step 2 instead.
- A line that starts with `WARN` does not stop it: carry on. If the line says what to do, do it when the install has finished. `Claude Code is not logged in — run: claude`, for example, is done in Step 8: Claude then asks you to sign in, as in Step 3.
- If the node line says `note: Node.js not found`, this window cannot see Node.js, and the next screen is not the one shown in 6b: see the box at the start of 6b.

### 6b · The plan screen: choose live mode

> **Does the screen show Plan: Mode design-only (fixed — Node.js 20+ not found) · Docs full, with Enter = run · s = docs skip · q = quit under it?** Then this window cannot see Node.js, and the plan offers no live mode. Do not type `1` there: on this screen any answer but `s` or `q` starts the install. Type `q` and press **Return**; nothing has been changed yet. Then see the row for this line in "If something goes wrong".

On screen:

```
Installing the AI ServiceNow Architect into this folder only — nothing else on the machine changes.
Two choices below, then it runs on its own (a few minutes; live adds a short wizard).
Plan — Enter runs it as shown · type a number to choose that line's value · "?" explains · q quits
  1  Mode   design-only          live needs a ServiceNow instance (wizard runs in this terminal); Node 26.13.1 found
  2  Docs   full                 full = whole corpus · skip = none (the doctor will report FAIL)
  Steps  B01 workspace · B02 docs · B05 tool list · B07 Claude settings · B09 summary
>
```

| Line | Choices | What to pick |
|---|---|---|
| 1 Mode | **design-only** works from the ServiceNow documentation and the specialist skills, with no instance. **live** also connects one ServiceNow instance. | **live**, to work with your instance. Pick design-only only if you have no instance yet; you can add one later. |
| 2 Docs | **full** downloads all of the ServiceNow documentation. **skip** downloads none, and the health check then fails. | **Leave it on full.** |

To switch to live mode, press these keys:

1. Type `1` and press **Return**. The mode menu opens (see below).
2. Type `2` and press **Return**. The plan comes back with `Mode live` and more steps in the *Steps* line. Check that the *Steps* line names `B06 instance` and `B08 verify`. If it does not, the installer found no licence in force: type `q`, press **Return**, and check Step 5. If the file is in place, the licence may have ended or be damaged: ask whoever gave it to you.
3. Press **Return** once more. The install starts.

On screen after step 1:

```
> 1
Mode:
  [1] design-only — works from the ServiceNow docs and the specialist skills; no instance (current)
  [2] live — also connects one ServiceNow instance (the wizard asks for URL and login)
>
```

On screen after step 2:

```
  1  Mode   live                 live needs a ServiceNow instance (wizard runs in this terminal); Node 26.13.1 found
  2  Docs   full                 full = whole corpus · skip = none (the doctor will report FAIL)
  Steps  B01 workspace · B02 docs · B04 deps · B05 tool list · B06 instance · B07 Claude settings · B08 verify · B09 summary
Mode → live · Enter runs it · 1 changes it again · q quits
>
```

Changed your mind before the last Return? Type `1` again. `?` explains each line, and `q` quits without changing anything.

### 6c · It downloads the documentation (2 to 3 minutes)

On screen:

```
clients/ made, empty: it is yours, and git ignores it
release manifest: v2.2.5 fetched (473 files)
[B01/09] workspace … ok (4 s)
[docs] clone (depth 1, blobless, full) … 1.1 s
[docs] sparse disable (full mode) … 0.0 s
[docs] checkout --detach 96d3212 … 42.0 s
[docs] 45.3 s · pin 96d3212 · full · complete
docs: ServiceNow product documentation © 2026 ServiceNow, Apache-2.0 — vendor/ServiceNowDocs/LICENSE
[docs] names index … 28.8 s · 75,431 names · 51,178 pages · coverage full
[docs] 51,186 files · 286 MB working tree
citations: checked: 609 | dead: 0
[B02/09] docs … ok (75 s)
[B03/09] mode … ok (0.0 s)
[B04/09] deps … installing (npm ci)
[B04/09] deps … ok (7 s)
[B05/09] tool list … ok (0.0 s)
```

(The release numbers in these examples come from an earlier release; yours name the release you downloaded.)

This downloads all 51,178 pages of ServiceNow documentation that the Architect reads before it answers. The screen can sit still for a minute or two. Let it run. On the AI Architect's automatic macOS test this part took 75 seconds; in our Windows test it took two and a half minutes.

### 6d · The instance wizard: seven questions

On screen:

```
Instance wizard — seven steps (six questions and a login check).
Have ready: the instance URL and a username + password for it. Nothing is saved until the end.
```

> **Made a mistake?** Nothing is saved until the very end. Press **Control+C**, then run `./bootstrap.sh` again. It shows the plan screen first: if its Mode line says live, press **Return**; if not, choose live as in 6b. It skips what is already done and brings you back to this wizard. After the wizard has finished, you change things with one command each; see "Change settings later".

#### Question 1 of 7 · Label

On screen:

```
[1/7] Label — a short name you will type in commands, e.g. pdi, acme-dev
Label [pdi]:
```

- **What it is:** a nickname for this instance. You will use it later in commands, for example to change the password.
- **What to type:** a short name of up to 32 lower-case letters, digits, `-` or `_`, starting with a letter, such as `pdi` or `acme-dev`. The name in brackets is a suggestion: press **Return** to take it.

#### Question 2 of 7 · Instance URL

On screen:

```
[2/7] Instance URL
Instance URL (https://<host>, no path):
```

- **What it is:** the address you open in your browser to reach ServiceNow.
- **What to type:** only the beginning, up to and including `.service-now.com`. Leave out everything after it.
- **Example:** if your browser shows `https://<your-instance>.service-now.com/now/nav/ui/home`, type `https://<your-instance>.service-now.com`. A slash at the very end does no harm: the wizard removes it and says `trailing slash removed`.

#### Question 3 of 7 · Environment

On screen:

```
[3/7] Environment
What is this instance?
  [1] pdi — your personal developer instance (devNNNNNN.service-now.com)
  [2] dev — a shared development instance
  [3] test — a test / UAT instance
  [4] prod — real users; the wizard saves it read-only
> 1
Environment → pdi
```

- **What it is:** what kind of instance this is. It decides which permissions the wizard proposes at question 7.
- **What to type:** the number of the matching line, then **Return**. On a PDI address (devNNNNNN.service-now.com) the pdi line ends in `· Enter picks this`: press **Return**, or type `1`. Choose honestly:

| Type | Choose it when |
|---|---|
| 1 (pdi) | It is your own free personal developer instance, usually devNNNNNN.service-now.com. |
| 2 (dev) | It is a development instance you share with your team. |
| 3 (test) | It is a test or UAT instance. |
| 4 (prod) | It has real users. The wizard saves it **read-only**: the Architect can read but cannot change anything there. |

Right after this question the screen shows a line like the one below. It only reports your proxy settings; you type nothing. `unset` is normal. Behind a company proxy, see "If something goes wrong".

```
network: HTTPS_PROXY=unset · NO_PROXY=unset · NODE_EXTRA_CA_CERTS=unset
```

Then the wizard checks that it can reach the address. If it cannot, the screen says `reachability: FAIL` with a remedy under it, and offers `[1] re-enter the URL`, `[2] retry` and `[3] abort (nothing is saved)`. Type `1` and press **Return** to type the address again, or `2` to try the same address once more. Return alone stops the wizard, and nothing is saved.

#### Question 4 of 7 · Authentication

On screen:

```
[4/7] Authentication
Authentication?
  [1] basic — username + password (recommended for PDI; no instance-side setup) · Enter picks this
  [2] oauth_ropc — OAuth password grant (legacy; needs client id + secret AND a user password;
                   instances can disable it)
> 1
Authentication → basic
```

- **What it is:** how the AI Architect signs in to ServiceNow.
- **What to type:** `1` (basic), or just press **Return**. Choose `2` only if your ServiceNow administrator gave you an OAuth client ID and secret and asked you to use them.

#### Question 5 of 7 · Credentials

On screen:

```
[5/7] Credentials
Username (a ServiceNow user on this instance — admin on a PDI): admin
Password (nothing is shown while you type):
```

- **What to type:** the user name and password you use to log in to this instance in the browser. On a PDI the user name is `admin`.
- **The password:** nothing appears while you type it, not even dots. That is on purpose. Type it, or paste it with **Command+V** (nothing appears either way), then press **Return**.
- **Where it goes:** it stays on this Mac, in your AI Architect folder. It is never sent into the chat with Claude.

#### Question 6 of 7 · Login check

On screen:

```
[6/7] Checking the login and what this account may do (read-only, a few seconds) …
[INFO] Querying ServiceNow table: sys_user
[INFO] Querying ServiceNow table: sys_user_has_role
[INFO] Querying ServiceNow table: sys_update_set
... four more lines like these
```

- **What happens:** the installer signs in and reads a few tables to learn what your account may do. It changes nothing on the instance.
- **What to type:** nothing. The `[INFO]` lines are normal.
- **If it fails:** the message says why. Most often the address, user name or password has a typo. Nothing has been saved: press **Control+C** and run `./bootstrap.sh` again.

#### Question 7 of 7 · Permissions

On screen:

```
[7/7] Permissions
Permissions for instance "pdi" (environment pdi) — what Claude's tools may do there.
Proposed: full (everything on)
  1  [x] WRITE        probe: ok
  2  [x] CMDB_WRITE   probe: ok
  3  [x] SCRIPTING    probe: ok
  4  [x] ATF          probe: ok
  5  [x] NOW_ASSIST   probe: ok
  6  [x] FLUENT       probe: ServiceNow SDK not installed — recommend: off (type 6)
                      npm i -g @servicenow/sdk
Enter = apply as shown · a number opens that flag · "preset <name>" switches · "?" explains
```

**What it is:** which kinds of changes the AI Architect may make on this instance. `[x]` means allowed and `[ ]` means not allowed. `probe: ok` means your ServiceNow account is able to do it.

| Permission | What it allows |
|---|---|
| WRITE | Create, update and delete records: incidents, catalog items, users, update sets. Without it, everything is read-only. |
| CMDB_WRITE | Also write configuration items and their relationships in the CMDB. Needs WRITE. |
| SCRIPTING | Write Script Includes, Business Rules, Client Scripts, ACLs and UI Actions. Reading them is always allowed. Needs WRITE. |
| ATF | Run Automated Test Framework tests. Reading tests and results is always allowed. |
| NOW_ASSIST | The Now Assist (generative AI) tools. Needs a Now Assist licence on the instance. |
| FLUENT | The ServiceNow SDK (Fluent) build and deploy tools. Needs the ServiceNow SDK installed on this Mac. If you do not use it, switch it off. |

On a Mac where the ServiceNow SDK is not installed yet (it is optional; see "Optional tools"), the FLUENT line says `ServiceNow SDK not installed — recommend: off (type 6)`, as above. Switch FLUENT off as shown below; you can switch it on later.

**To accept the list as it is,** press **Return**.

**To change one permission,** for example to switch FLUENT off:

1. Type its number, `6`, and press **Return**.
2. The screen shows `FLUENT:  [1] on (current)  [2] off — recommended: ServiceNow SDK not installed`. Type `2` and press **Return**.
3. The list comes back with `[ ] FLUENT`. Change others the same way, then press **Return** to apply.

**To choose a ready-made set,** type `preset`, a space and its name, then press **Return**:

| Preset | What is on | When |
|---|---|---|
| full | Everything | Proposed for pdi, dev and test instances. |
| pdi-developer | Everything except NOW_ASSIST and FLUENT | Building on a PDI, dev or test instance without the AI and SDK tools. |
| read-only | Nothing | Reviewing and designing against a real instance. The only choice for a prod instance. |
| custom | What you set by hand | Shown automatically after you change single permissions. |

> **The AI Architect always asks before it changes anything.** Even with every permission on, before each change on your instance it asks you a question of this form and waits for your answer: `About to <action> on instance "pdi" — write approved?` Permissions only say what it *may* ask for. Changing them here is not an approval.

On screen when it is saved:

```
Applying: preset custom — WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=off
Saved instance "pdi" (pdi · basic · preset custom · default).
Probes: auth: ok · write: ok · cmdb_write: ok · scripting: ok · atf: ok · now_assist: ok
FLUENT: off.
Saved to .local/instances.json in this folder — readable only by you (0600).
[B06/09] instance … ok (92 s)
```

### 6e · The end of the install

On screen:

```
[B07/09] Claude settings … ok (0.3 s)
[B08/09] verify … ok (12 s)
[B09/09] summary … ok (4 s)
Health check (quick): 16 ok · 1 warn (E-31 the licence) · 0 fail · 26 more run with ./snowarch doctor
Mode: live — instance=pdi (pdi) preset=custom
Next: run `claude` in this folder: /Users/you/AI-Arch
      You will see one workspace-trust dialog — answer Yes.
      (If you are already inside Claude Code in this folder: exit it and start `claude` again.)
      In Claude, /mcp should show: servicenow ✔ connected · /snowarch status quotes the Mode line above.
... a short list of commands for changing settings later ...
you@MacBook-Air AI-Arch %
```

- **Health check:** `0 fail` is what matters. A `warn` or a `fail` names the check it comes from. `E-31 the licence` warns in the last days before the licence ends. With a licence that runs for longer, this line shows no warning. The example above comes from an install whose licence was on its last day.
- **Mode:** says live, with your instance label.
- **Next:** names your folder. That is where you start Claude.

The line that ends in `%` comes back by itself; there is no key to press.

## Step 7 · Check your licence

Run:

```
./snowarch licence check
```

On screen (example):

```
Licence: ok · LIC-2026-0000 · until 2026-12-31
  valid until:  2026-12-31 (UTC, 43 days)
  revocation list: none held
  nothing is refused while the licence is in force
```

This example licence has 43 days left, so it says `ok`, and the health check at the end of the install shows no E-31 warning for it.

| First word | Meaning | What to do |
|---|---|---|
| ok | Everything works. | Nothing. |
| expiring | The last days before the end date. Everything still works. | Ask for a renewal; see "Licence renewal". |
| expired | The end date has passed. ServiceNow tools stop working. | Ask for a renewal. |
| missing | There is no .local/licence.json. | Repeat Step 5. Then run `./bootstrap.sh` again: it runs the instance wizard (6d) and the verify step that it left out. If its plan shows Mode design-only, switch to live as in 6b. |
| invalid | The file is damaged or is not a licence. | Ask for a new copy of the file. |
| revoked | The licence was withdrawn. | Contact whoever gave it to you. |

If the first word was not `ok` or `expiring` when you ran the installer, it left out the instance wizard (6d) and the verify step. Once a new licence file is in place (Step 5 or "Licence renewal"), run `./bootstrap.sh` again: it runs them. If its plan shows Mode design-only, switch to live as in 6b.

A licence works through its end date, counted in UTC time. If the first line also says `design-only`, your licence covers design-only mode, and live mode refuses every ServiceNow tool: ask whoever gave you the licence for a live one, or switch with `./snowarch mode design`.

## Step 8 · Start the AI Architect

Always start it from inside your `AI-Arch` folder.

Run:

```
claude
```

1. If Claude asks you to sign in, do it as in Step 3. If it asks whether you trust this folder, answer **Yes**. It asks only the first time.
2. Type `/mcp` and press **Return**. Under *Project MCPs* you should see `servicenow` with a tick. Other lines come from your own Claude account and do not matter here. Press **Esc**.
3. Type `/snowarch status` and press **Return**. The first lines should match the end of the install.
4. Ask a first question that only reads, for example *How many open incidents are there?* The AI Architect reads the answer from your instance and tells you what it read.

On screen after step 2 (example; the tick may look different):

```
Project MCPs (/Users/you/AI-Arch/.mcp.json)
✔   servicenow                  399 tools
```

On screen after step 3:

```
Mode: live — pdi (pdi) · preset custom · WRITE=on CMDB_WRITE=on SCRIPTING=on ATF=on NOW_ASSIST=on FLUENT=off · 399 tools (contract)
Licence: ok · LIC-2026-0000 · until 2026-12-31
Integrity: verified · v2.2.5 · 473 files
Docs: vendor/ServiceNowDocs @ 96d32129bb43 (australia) · full
```

> **You are done.** The AI Architect is installed, licensed and connected. The User Guide in your folder, `docs/USER-GUIDE.md`, shows how to work with it, with examples for analysts, architects and developers.

---

## Optional tools

The AI Architect works without them. Each one adds a feature.

Node.js does not update itself: it stays at the version of 2b. To move to a newer one later, follow 2b in the newest copy of this guide (after `./snowarch upgrade`, it is `docs/INSTALL-MACOS.md` in your AI-Arch folder; see "New releases"); on path B, leave out its PATH command, because the line is already there.

| Tool | What it adds |
|---|---|
| ServiceNow SDK | The Fluent build and deploy tools, the FLUENT permission (wizard question 7). |
| Microsoft Word | Opens and checks the Word documents the Architect writes. Usually installed by your company. |
| python3 | Makes the Word documents on a Mac. It is usually already there; check it below. |

### ServiceNow SDK

Run these in Terminal, in your AI-Arch folder, outside Claude.

Run:

```
npm install -g @servicenow/sdk
```

Run:

```
now-sdk --version
```

If npm stops with an error about permissions (`npm error code EACCES`), do not use `sudo`, even if npm's message suggests running it as root or as an administrator: leave the SDK out and keep FLUENT off, or ask for help (see "Asking for help"). If npm suggests a newer npm at the end, you can ignore it. If `now-sdk --version` answers `command not found`, quit Terminal and open it again as in Step 1, go back to your folder with `cd ~/AI-Arch`, and run it again.

Then switch the FLUENT permission on, in your AI-Arch folder (use your own label in place of `pdi`), and restart Claude:

Run:

```
./snowarch instance set-flags pdi FLUENT=on
```

### Word documents (python3)

On a Mac the AI Architect makes its Word documents with python3. Check that this Mac has it:

Run:

```
python3 --version
```

It must answer with a line that starts with `Python 3`. If a window offers to install the command line developer tools instead, those are the tools from 2a: install them as there (path B: ask your IT team). After the install, `./snowarch doctor` says the same on its *Capabilities* line: `docx yes (python3)`.

## Every day

1. Open Terminal: press **Command+Space**, type `Terminal`, press **Return**.
2. Go to your folder (see below).
3. Start the AI Architect (see below).

Behind a company proxy, first set the proxy in this window, as in "If something goes wrong".

Run:

```
cd ~/AI-Arch
```

Run:

```
claude
```

Start `claude` only from this folder. Started anywhere else, the AI Architect is not loaded and `/mcp` shows no servicenow line.

## Change settings later

You never need to reinstall to change a setting. Run these in Terminal inside your `AI-Arch` folder, outside Claude. Afterwards, restart Claude: type `/exit`, then `claude`. Replace `pdi` with your own instance label.

**Change the password.** Run:

```
./snowarch instance set-credentials pdi
```

It asks for the user name first, with the current one shortened in brackets: press Return to keep it. Then type the new password (nothing is shown) and press Return. It is saved only if the instance accepts it.

**Switch to a ready-made permission set.** The last word is the set: `full`, `pdi-developer` or `read-only`. Run:

```
./snowarch instance set-preset pdi pdi-developer
```

**Switch single permissions on or off.** Write each permission as NAME=on or NAME=off. This example allows record changes and blocks CMDB changes. Run:

```
./snowarch instance set-flags pdi WRITE=on CMDB_WRITE=off
```

**Test the connection.** Run:

```
./snowarch instance test pdi
```

**See your instances.** Run:

```
./snowarch instance list
```

**Fix a wrong address.** Remove the instance, then add it again as described under "Add another instance". Run:

```
./snowarch instance remove pdi
```

It asks whether to remove the instance and its stored credentials; the question ends in `[y/N]`, so the default is no. Type `y` and press Return to remove it. Any other answer removes nothing.

**Add another instance.** Inside Claude, type `/snowarch setup-instance`. It asks for a label and an address in the chat, then gives you one command to run in Terminal, where you type the password. Leave Claude open and open a second Terminal window: in the menu bar choose **Shell › New Window**, or press **Command+N**. In that window, run `cd ~/AI-Arch`, then the command, and type the password there. Your password never passes through the chat. When that window says *Saved instance*, go back to the window with Claude and type `/snowarch setup-instance --resume`.

**Work without the instance for a while.** Design-only mode keeps your saved instance but stops using it. Run:

```
./snowarch mode design
```

Back to live mode. Run:

```
./snowarch mode live
```

**Run the full health check.** Run:

```
./snowarch doctor
```

## Licence renewal

When `licence check` says `expiring`, ask whoever gave you the licence for a renewal. You receive a new file. Before you save it, move the licence file that is already in your Downloads folder (the one from Step 5), if it is still there, to the Trash. Then save the new file in Downloads, so that it is the only one there.

Go to your folder first. Run:

```
cd ~/AI-Arch
```

Copy the new file over the old one. It prints nothing when it works. Run:

```
cp ~/Downloads/LIC-*.json .local/licence.json
```

If it answers with an error, Downloads holds more than one licence file: keep only the new one, then run it again.

Check that the new licence is in place. Run:

```
./snowarch licence check
```

Its first word should now be `ok`, with your new end date after `until`. If it still shows the old date, the old file was copied: make sure Downloads holds only the new licence file, then run the copy again.

If the first word of `licence check` was not `ok` or `expiring` when you ran the installer, run `./bootstrap.sh` again now, as Step 7 says: it runs the instance wizard (6d) and the verify step that it left out.

Then restart Claude (`/exit`, then `claude`). The licence is read when Claude starts, so a window that was already open keeps the old state until you restart it.

> **After the end date** ServiceNow tools stop working. These commands still work, so you can see what is wrong and fix it: `licence`, `doctor`, `status`, `version`, `upgrade`, `bootstrap` and `mode design`.

## New releases

Check whether a newer release is out. This changes nothing. Run:

```
./snowarch upgrade --check
```

Move to the newest release. Run:

```
./snowarch upgrade
```

It shows a plan first and asks `Proceed? [Y/n]`. Press Return, or type `y` and press Return, to accept it; any other answer changes nothing. Your instances and passwords are not touched. Restart Claude afterwards.

## If something goes wrong

| What you see | What to do |
|---|---|
| zsh: command not found: claude (in bash: claude: command not found) | Run the PATH command in Step 2d for your shell (Step 1), quit Terminal and open it again. |
| command not found for git, node, npm or now-sdk | Quit Terminal (Terminal › Quit Terminal) and open it again as in Step 1: programs installed in Step 2 are seen only by new windows. If it persists, repeat that program's part of Step 2; on path B, Node.js includes its PATH command in 2b. For git, see 2a. |
| node does not start: bad CPU type in executable, or a message that it cannot run on this Mac | On path B you downloaded the Node.js file for the other kind of Mac. Check Chip or Processor in About This Mac (see "What you need"), then run the download and the tar command of 2b for your Mac again. |
| snowarch: Node.js 20+ is required and was not found on PATH. | This window cannot see Node.js. Quit Terminal and open it again as in Step 1, go to your folder with `cd ~/AI-Arch` and run the command again. If it persists, repeat 2b; on path B, including its PATH command. The line under it suggests brew: this guide does not use it. |
| The plan says Plan: Mode design-only (fixed — Node.js 20+ not found) · Docs full | The installer cannot see Node.js in this window. Type `q` and press Return; nothing has been changed. Then do as in the row above, and run `./bootstrap.sh` again. |
| A message suggests brew install … | This guide does not use Homebrew. Install that program as in Step 2 instead: Git in 2a, Node.js in 2b, draw.io in 2f. |
| macOS asks for an administrator's name and password that you do not have | On path B the one step that needs an administrator is Apple's Command Line Tools (2a): click Cancel and ask your IT team. Anywhere else, you are on a path A step: follow path B instead, or for draw.io drag it into your own Applications folder (2f). |
| zsh: permission denied: /Users/you/.zshrc (in bash: bash: /Users/you/.bash_profile: Permission denied) when you add a PATH line | Your account cannot write to that file, and nothing was saved. Run `ls -l ~/.zshrc` (bash: `ls -l ~/.bash_profile`): the third word is the file's owner. If it is you, make the file writable with `chmod u+w ~/.zshrc` (bash: `chmod u+w ~/.bash_profile`) and run the PATH command again. If it is another account, such as root, ask your IT team: giving the file back to you needs an administrator. |
| ERROR: draw.io Desktop not found | Path A: draw.io is not in `/Applications`. Repeat 2f and check that the `ls` command answers with the path. Path B: repeat 2f for path B, including its last command, which makes the `drawio` command. |
| macOS says that draw.io cannot be opened, or cannot be checked | Do not override it. Move draw.io to the Trash, from the Applications folder you put it in, then repeat 2f from its download command. If macOS still refuses it, ask for help (see "Asking for help") and say what macOS showed. |
| A download in Step 2 stops with curl: (22) The requested URL returned error: 404 | The file is not at that address. Check that you copied the whole line and run it again. If it still fails, send what it printed and say which download it was (see "Asking for help"). If it is the draw.io download (2f), carry on with Step 3 meanwhile: the installer does not need draw.io. |
| dyld: Symbol not found, dyld: cannot load or Abort trap: 6, while Claude Code installs or when node runs | That program does not run on this Mac's version of macOS. Check your version in About This Mac: this guide needs 13.5 or later. Update macOS through Software Update; on a company Mac, ask your IT team. |
| bash: line 1: syntax error near unexpected token '<', or HTML text such as <!DOCTYPE html>, while Claude Code installs | The install address returned a web page instead of the installer. If the text says App unavailable in region, Claude Code is not available in your country. Otherwise wait a few minutes and run the command of 2c again; behind a company proxy, see the proxy row. |
| warning: refs/tags/... is not a commit! | Harmless. Continue. |
| A line in the installer's check (Step 6a) is not ok | A FAIL line says what to do: do it, then run ./bootstrap.sh again; it continues where it stopped. A WARN line does not stop the installer; see 6a. |
| no such file or directory for ./bootstrap.sh or ./snowarch | This window is not in your AI-Arch folder. Run `cd ~/AI-Arch`, then the command again. |
| github.com or another download site cannot be reached, or you are behind a company proxy | Ask your IT team for the proxy address, set it in the window as shown below, then run the command that failed again. The setting lasts only for that Terminal window: set it again in each new window, before ./bootstrap.sh or claude. |
| SSL certificate problem, unable to get local issuer certificate, TLS interception detected or TLS_CA_UNTRUSTED | Usually your company inspects internet traffic, and the program does not trust the company's certificate yet. Ask your IT team for the company's root certificate as a PEM file, and show them the message. Once you have the AI-Arch folder, its file docs/TROUBLESHOOTING.md (TLS_CA_UNTRUSTED) shows where the certificate goes. Never switch certificate checks off. |
| The login check (question 6) fails | Check the address, user name and password. Press Control+C and run ./bootstrap.sh again. |
| WARN STORE_IN_CLOUD_SYNC_FOLDER, or: this checkout is inside a cloud-synced folder | Your AI-Arch folder is inside iCloud Drive, OneDrive, Dropbox, Google Drive or another sync folder, and your password file would be copied with it. At the wizard's question, press Return to stop; nothing is saved. Then download the AI Architect again into your home folder as in Step 4, and copy your licence again (Step 5). |
| Operation not permitted, or no matches found although the licence file is in Downloads, when a command reads your Downloads folder | Terminal is not allowed into Downloads. Allow it as described in Step 5b, then quit and reopen Terminal. If the switch is missing or cannot be turned on, ask your IT team. |
| /mcp shows no servicenow line | Claude was started outside your folder. Type /exit, then follow "Every day". |
| The licence says expired or missing | See "Licence renewal". If it says missing, repeat Step 5. Then, if it did not say ok or expiring when you ran the installer, run ./bootstrap.sh again (Step 6): it runs the wizard it left out. |
| A question you did not expect | Press Control+C, never Return. Then paste one command at a time. |

Setting a company proxy for the current window (replace the address with the one from your IT team). Run:

```
export HTTPS_PROXY=http://proxy.example.com:8080
```

Change the address before you press Return (see "How to use this guide"). This lasts only as long as this window: if you pressed Return too soon, quit Terminal, open it again and set it once more. In every new Terminal window, set it again before you run the commands of this guide, the installer and `claude` included.

Reloading PATH in the current window instead of opening a new one. Run only the one for your shell (Step 1):

**zsh**. Run:

```
source ~/.zshrc
```

**bash**. Run:

```
source ~/.bash_profile
```

### Asking for help

Run these two commands in your folder and copy their full output into your message: select it with the mouse, from the command down to the line that ends in `%`, then press **Command+C**. Neither shows your password or your instance address. Say also which path you followed (A or B) and whether your Mac has Apple silicon or an Intel processor. Before Step 4 there is no folder yet: then send what the last command printed instead.

Run:

```
./snowarch version
```

Run:

```
./snowarch doctor
```

## Uninstall

1. In your folder, switch the AI Architect off. This is always safe (command below).
2. Quit Claude (`/exit`) and Terminal. Then, in Finder, choose **Go › Home** in the menu bar and move the folder `AI-Arch` to the Trash. Your saved password goes with it, and is gone for good once the Trash is emptied.
3. If you ever made the folder `~/.config/snowarch` (this guide does not), delete it too.

Run:

```
./snowarch mode design
```

The programs from Step 2 stay on your Mac. They do not need the AI Architect.

## Your data and safety

- Your ServiceNow password is stored only in `.local/instances.json` inside your AI Architect folder. It never goes into the chat. Nobody helping you needs it, so never send that file.
- The installer makes that file, and the folder `.local` around it, readable only by your account (file mode 0600, folder mode 0700). An administrator of this Mac, such as your IT team, can still read it. `./snowarch doctor` checks it (check SV-02); `./snowarch doctor --fix` repairs it after showing what it will change.
- Keep your AI-Arch folder out of Desktop, Documents and any folder that iCloud Drive or another sync tool copies (Step 4): file permissions do not stop a sync tool, which runs as you, from copying the file.
- The AI Architect asks *write approved?* before every change on your instance, and a prod instance is saved read-only.
- Your licence file is issued to you. Do not share it.

## What has not been tested

This guide was written from the AI Architect's own code and from its automatic tests on macOS, not from a person's install on a Mac. These things in it rest on something other than a run:

- **The whole install on a Mac, from start to end.** The automatic tests on macOS run the installer in design-only mode only, with the plan accepted in advance, and without the Claude Code checks. So the screens of the plan keys (6b), the end of 6c, 6d, 6e, Step 7 and Step 8 come from the code and from our Windows test, not from a Mac.
- **Intel Macs, and macOS 13.5 to 15.** The automatic tests run on a Mac with Apple silicon and macOS 26.
- **The screens of Apple's Command Line Tools window, the Node.js installer and the draw.io disk image** (2a, 2b, 2f), and macOS's question about the Downloads folder (5b). They are described in general terms.
- **Path B as a whole:** Node.js unpacked into your home folder with its PATH line, and draw.io in your own Applications folder with the `drawio` command.
- **Claude Code's first-run screens on macOS** (Step 3). They are described in general terms because they change with Claude Code's releases.
- **A folder name with a space in it, a folder on a network drive, and a folder that iCloud Drive or another sync tool manages** (Step 4).
- **What the screens say after the licence has ended** (Step 7). The table is the product's own list of states, not a transcript of each one.

If you meet a difference, `./snowarch version` and `./snowarch doctor` (see "Asking for help") are what to send.

---

Not yet tested end to end on a Mac. Written on 18 November 2026 from the AI Architect's code and from its automatic macOS tests of that day (macOS 26.7.2 on Apple silicon). It installs Git from Apple's Command Line Tools, Node.js 26.13.1, Claude Code from its official installer and draw.io 32.7.4, and the AI Architect release that Step 4 names.
