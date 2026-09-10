# Personal Terminal

Linux 登录终端风格的个人主页：近全屏窗口、泛白纸色背景、统一字号的像素字体。纯 HTML / CSS / Vanilla JavaScript，无依赖、无构建步骤、无后端。终端只访问内存中的虚拟文件系统，不执行真实 Shell。

## 项目结构

```text
index.html                 页面与终端入口
css/main.css               纸色终端、统一字体与响应式布局
js/filesystem.js           内容校验、虚拟文件系统与命令
js/terminal.js             登录信息、输出、输入与快捷键
data/site-data.json        所有个人内容
assets/fonts/              本地像素字体及许可证
tests/                     无依赖自动化测试
.nojekyll                  直接发布静态资源
```

## 本地运行

在项目根目录运行：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

打开 <http://localhost:8000>，Ctrl+C 停止服务。不要直接双击 HTML：ES Modules 和 JSON fetch 需要 HTTP 服务。无需安装依赖或配置环境。

## 修改内容

直接修改 `data/site-data.json`，无需修改 HTML 或 JavaScript：

- `profile`：姓名、用户名、自我介绍、邮箱和 GitHub。
- `education`：教育经历列表，包含 `school`、`degree`、`period` 和 `description`。所有条目都会显示在登录欢迎区，也可以通过 `cd education` 阅读。
- `projects`：项目列表，包含 `slug`、`name`、`description`、`github`、`demo` 和 `tags`。
- `research.interests`：研究兴趣。
- `links`：额外链接列表，每项包含 `name` 和 `url`。

添加项目时，在 `projects` 数组里复制一项并修改内容。`slug` 是目录名，必须唯一，由小写英文字母或数字开头，后续允许下划线、连字符。项目名称和介绍支持中文。没有 URL 时保留空字符串，没有标签时使用 `[]`。内容换行写作 `\n`。

更新流程：**修改 JSON → 本地预览 → git commit → git push**。

页面已移除 `edit`、导入导出及 localStorage 功能。每次加载都读取发布的 JSON；以前留下的浏览器草稿不会被读取，也不会覆盖新内容。

## 浏览内容

```sh
help
cat about.txt
cd education
cd ~/research
cd ~/projects
ls
# 然后 cd 到 ls 显示的项目目录
cd ..
cd ~
pwd
tree
whoami
history
open github
open ~/contact.txt
clear
```

Education、Research 和项目详情保留文件夹结构，内容放在各自的虚拟 `README.md` 中。执行 `cd education` 等命令时，如果目录只有一个条目且它是文件，就在切换目录后自动打印该文件全文及链接，相当于自动执行一次 `cat README.md`，无需额外输入。`ls` 仍列出文件名，`tree` 仍显示 README，也可以手动 `cat README.md`。含多个条目、空目录或仅含一个子目录时不会自动打印内容。自动读取不会额外添加一条命令历史。

- `cd` 无参数回到家目录；支持 `.`、`..`、`~` 和 `~/projects`。
- `pwd` 显示 `/home/<username>`；支持将返回的绝对路径交给 `cd`。模拟器将 `/` 视为主页根目录，不模拟系统目录。
- `ls [path]`、`tree [path]` 支持相对路径；`cat` 可接受多个文件。
- ↑ / ↓ 遍历本次会话历史，回到底部恢复尚未提交的输入。
- Tab 补全命令、目录、文件或链接别名；多个匹配时显示候选。Shift+Tab 移出输入框。
- Ctrl+L 清屏并保留历史和输入；`clear` 也不会删除历史。
- `open` 显示可点击链接，支持别名、HTTP(S) / mailto URL、文件和目录。
- 不支持管道、重定向或真实 Shell。文件按纯文本展示，HTML 也只作为文字显示。

## GitHub Pages 部署

使用 `username.github.io` 作为仓库名称（替换成你的 GitHub 用户名），将文件放在仓库根目录并推送。在仓库 **Settings → Pages → Source** 选择 **Deploy from a branch**，发布分支选择 `main`（或实际分支），目录选择 **/(root)**，保存。

部署完成后访问 `https://username.github.io/`。无需构建命令或环境变量。资源均使用相对路径，也支持 `https://username.github.io/repository/`。

参考：[GitHub Pages 快速入门](https://docs.github.com/en/pages/quickstart) · [配置发布分支](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 字体与视觉

全站采用统一的 22px 基准字号。桌面四周保留 16px 边距，手机端保留 6px；终端填满其余视口。背景为泛白纸色，保留极轻的静态颗粒纹理。颜色与字号可在 `css/main.css` 的 `:root` 中调整。

像素字体 [VT323](https://github.com/google/fonts/tree/main/ofl/vt323) 保存在 `assets/fonts/`，无需第三方字体服务或系统安装，随附 SIL Open Font License。字体不包含的字符（例如中文）使用等宽后备字体。

## 测试

使用已安装的现代 Node.js：

```sh
node --test tests/*.test.mjs
```

覆盖当前 JSON 校验、主要命令、单文件目录自动展示及链接、多条目/空目录、路径与补全、键盘历史和清屏、登录教育信息、忽略浏览器存储，以及部署相对路径。命令测试使用独立样例数据，修改个人资料不会破坏测试。

UI 测试使用轻量 DOM 适配器；当前环境无可用浏览器连接，真实浏览器视觉和手机布局仍需本地预览检查。
