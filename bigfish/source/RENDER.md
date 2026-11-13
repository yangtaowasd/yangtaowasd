# 动画源文件

这份目录用于以后修改角色位置、文字、速度或剧情；主页显示动图不需要它。

## 生成动画帧

需要 Node.js、npm，以及能显示中文的 Noto Sans CJK 字体。安装后在本目录运行：

```sh
npm install
npm run render
```

角色原图为 `characters.png`，脚本在画布中读取精灵并渲染，不修改原图。

## 编码为循环 GIF

需要 FFmpeg。在本目录运行：

```sh
ffmpeg -y -framerate 20 -i frames/frame-%04d.png -filter_complex "[0:v]split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" -loop 0 ../assets/rice-run.gif
```

默认动画为 960 × 420、20 fps、12 秒。一次白饭拾取同时让场景移动速度和后续加分倍率变为 1.05。

画面中的分数和事件是固定剧情演示，不是可操控的网页游戏。

如字体不在默认路径，可传入 `--font /你的字体路径/NotoSansCJK-Regular.ttc`，或设置 `FISH_FONT`。
