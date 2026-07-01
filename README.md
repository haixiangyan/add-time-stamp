# time-stamp-cli

给图片生成带**怀旧日期戳**的**副本**——橙色日期（`YYYY MM DD`，系统字体）打在**右下角**。

- 输入可以是**单个图片文件**，也可以是一个**目录**（处理其中所有图片）。
- 生成的副本叫 `<原名>-stamped.<后缀>`，与原图放在同一目录，**不改动原图**。
- 作为输入时会跳过 `*-stamped.*` 文件（避免重复加水印），但其余图片都会处理；同名的 `-stamped` 副本若已存在会被**直接覆盖**。
- **编码跟随原图，最小介入**：输出格式跟原图扩展名一致（PNG 进 PNG 出）；JPEG 的色度抽样（4:2:0 / 4:4:4）和基线/渐进都跟随原图，不强加 mozjpeg 等优化。默认 quality 100，体积贴近原图。
  - 注：JPEG 无法只在角落叠加，必须整张解码再重压，所以副本有极轻微的二次压缩损失（肉眼不可见）；原图始终不动。调低 `-q` 可省空间。
- **完整保留日期**：EXIF 拍摄日期 + 文件创建/修改日期都继承自原图，放回相册不会乱序。
- 日期来源默认 `auto`：优先 EXIF 拍摄日期（`DateTimeOriginal`），取不到再回退到文件创建/修改时间。
- 字号默认 120px，橙色，带轻微暗色描边保证任意背景下可读。

## 安装

```bash
npm install
# 可选：注册全局命令 time-stamp
npm link
```

## 使用

```bash
time-stamp <图片文件 | 目录> [选项]
# 未 npm link 时：node index.js <图片文件 | 目录> [选项]
```

### 选项

| 选项 | 说明 | 默认 |
| --- | --- | --- |
| `-s, --size <px>` | 字号（像素） | `120` |
| `--font <css>` | 字体（CSS font-family） | `Georgia, 'Times New Roman', serif` |
| `-p, --padding <px>` | 右边与下边的内边距 | `240` |
| `-c, --color <css>` | 数字颜色 | `#ff7a1a`（橙色） |
| `-q, --quality <1-100>` | JPEG/WebP 质量 | `100`（贴近原图体积） |
| `--date-source <s>` | 日期来源 `auto` / `exif` / `file` | `auto` |
| `-r, --recursive` | 目录模式下递归处理子目录 | 关闭 |
| `-h, --help` | 显示帮助 | |

### 示例

```bash
# 单个文件 -> photo-stamped.jpg
time-stamp photo.jpg

# 整个目录
time-stamp ~/Pictures/2008

# 自定义字号与颜色
time-stamp photo.jpg -s 90 -c '#ff9500'

# 换一个字体
time-stamp ./photos -r --font 'American Typewriter'
```

### 推荐的怀旧字体（macOS 自带）

| 字体 | 风格 | 适合 |
| --- | --- | --- |
| `Georgia` / `Times New Roman` | 经典衬线（**默认**） | 老报纸、书页感 |
| `Courier New` / `Courier` | 等宽打字机 | 老相机/打字机日期 |
| `Menlo` / `Monaco` / `SF Mono` | 终端等宽 | 数码、像素感 |
| `American Typewriter` | 打字机衬线 | 信件、胶片日记感 |
| `Palatino` / `Hoefler Text` | 书籍衬线 | 精装书、相册内页 |
| `Baskerville` / `Didot` | 印刷衬线 | 老杂志、排版感 |
| `Helvetica` / `Arial` | 经典无衬线 | 冲印标签、简约现代 |
| `Futura` / `Avenir` | 几何无衬线 | 复古海报、清爽数码 |
| `Optima` / `Gill Sans` | 人文无衬线 | 优雅、旅行手册感 |
| `Lucida Grande` | 老 Mac 界面 | 系统对话框、Y2K 数码 |
| `Impact` / `Copperplate` | 粗体/刻字 | 海报标题、名牌铭刻感 |
| `Chalkboard` / `Chalkboard SE` | 粉笔黑板 | 教室、怀旧涂鸦 |
| `Bradley Hand` / `Marker Felt` | 手写 | 手账、便签涂鸦感 |
| `Snell Roundhand` / `Zapfino` | 花体/script | 邀请函、浪漫胶片 |
| `Papyrus` | 仿古卷轴 | 玩梗、刻意做旧 |

支持格式：`jpg` / `jpeg` / `png` / `webp` / `tiff`。
