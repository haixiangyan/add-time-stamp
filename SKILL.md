---
name: add-time-stamp
description: 给照片右下角加怀旧日期水印（橙色 YYYY MM DD，胶片相机日期戳风格）。触发词：日期水印、时间戳、打日期、加日期、怀旧水印、批量盖日期、stamped。支持单张图片或整个目录。
---

# add-time-stamp — 给照片加怀旧日期水印

给一张图片或一个目录里的所有图片，在**右下角**加上橙色的日期水印（`YYYY MM DD`，老相机日期戳风格），生成副本 `<原名>-stamped.<后缀>`，**绝不改动原图**。

## 技能包结构

本 skill 是一个**自包含目录**，安装后任意用户可直接使用，不依赖作者本机路径：

```
add-time-stamp/
├── SKILL.md          # 本文件
├── index.js          # CLI 入口
├── package.json
└── package-lock.json
```

**发布/分享时**：将上述文件打成 zip（**不要**打包 `node_modules/`、`test/`、`.git/`）。他人导入后首次使用前在 skill 目录执行一次 `npm install`。

## 定位 skill 根目录

`$SKILL_ROOT` = **本 SKILL.md 所在目录**（不是用户项目目录、不是作者电脑路径）。

- WorkBuddy：通常在 `~/.workbuddy/skills/add-time-stamp/`
- 豆包 / Cursor 等：安装到各自的 skills 目录，规则相同
- 运行命令时一律用：`node "$SKILL_ROOT/index.js" ...`

## 首次运行：依赖安装

执行任何加水印命令**之前**，检查 `$SKILL_ROOT/node_modules/sharp` 是否存在；不存在则在 `$SKILL_ROOT` 执行：

```bash
npm install --omit=dev
```

**环境要求**：Node.js 18+（`node -v` 验证）。依赖 `sharp`、`exifr`，会在当前平台自动下载对应原生二进制，**不可**跨平台拷贝 `node_modules`。

## 重要：先引导用户，再执行

**不要拿到路径就直接跑。** 先确认：

1. **目标**：单张还是文件夹？文件夹是否递归（`-r`）？让用户给出**图片/目录的绝对或相对路径**。
2. **日期来源**（默认 `auto`）：`auto` 优先 EXIF 拍摄日期，取不到再用文件时间；`file` 强制文件时间；`exif` 仅 EXIF。
3. **外观**（默认值如下，问用户是否满意）：
   - 字号/边距：**按图片长边等比缩放**（4800px 长边 → 字号 130px、边距 300px）；可用 `-s` / `-p` 指定固定像素覆盖
   - 字体 `--font`（默认 `Helvetica`）
   - 颜色 `-c`（默认 `#ff7a1a` 橙色）
   - 画质 `-q`（默认 `100`）
4. 确认后执行，反馈处理数量与输出文件名。

> 引导示例：「我可以给这些照片右下角加橙色怀旧日期（默认 Helvetica、按图片大小自动缩放字号和边距、日期取拍摄时间）。直接用默认，还是想换字体/颜色？」

## 命令

```bash
node "$SKILL_ROOT/index.js" <图片文件 | 目录> [选项]
```

| 选项 | 说明 | 默认 |
| --- | --- | --- |
| `-s, --size <px>` | 字号（固定像素；不传则按长边比例） | 长边 4800px → 130px |
| `--font <css>` | 字体（CSS font-family） | `Helvetica` |
| `-p, --padding <px>` | 右/下内边距（固定像素；不传则按比例） | 长边 4800px → 300px |
| `-c, --color <css>` | 颜色 | `#ff7a1a` |
| `-q, --quality <1-100>` | JPEG/WebP 质量 | `100` |
| `--date-source <s>` | `auto` / `exif` / `file` | `auto` |
| `-r, --recursive` | 目录递归子目录 | 关闭 |
| `-h, --help` | 帮助 | |

## 示例

```bash
# 单张，默认
node "$SKILL_ROOT/index.js" ./photo.jpg

# 整个文件夹，递归，打字机字体
node "$SKILL_ROOT/index.js" ./photos -r --font 'Courier New'

# 固定字号与颜色
node "$SKILL_ROOT/index.js" ./photo.jpg -s 90 -c '#ff9500'
```

## 推荐怀旧字体（按系统选）

字体依赖用户操作系统已安装字体；推荐时用 CSS font-family 字符串，并告知「本机无该字体会回退到系统默认」。

| 字体 | 风格 | 适合 |
| --- | --- | --- |
| `Helvetica` / `Arial` | 经典无衬线（**默认**） | 冲印标签、简约现代 |
| `Georgia` / `Times New Roman` | 经典衬线 | 老报纸、书页感 |
| `Courier New` / `Courier` | 等宽打字机 | 老相机/打字机日期 |
| `American Typewriter` | 打字机衬线（macOS） | 信件、胶片日记感 |
| `Consolas` / `Menlo` / `Monaco` | 终端等宽 | 数码、像素感 |
| `Bradley Hand` / `Comic Sans MS` | 手写 | 手账、涂鸦感 |

## 行为保证

- **不动原图**：只生成 `-stamped` 副本；已带 `-stamped` 的文件自动跳过。
- **保留日期**：EXIF + 文件创建/修改时间继承自原图。
- **跟随原图编码**：格式一致；JPEG 色度抽样与基线/渐进跟随原图。
- 支持：`jpg` / `jpeg` / `png` / `webp` / `tiff`。

## 发布清单

分享前确认 zip 内包含：`SKILL.md`、`index.js`、`package.json`、`package-lock.json`；不含 `node_modules`。接收方导入后首次使用需 `npm install`。
