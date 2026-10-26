# 主题

参考页和编辑器使用 [`@dskripchenko/ui`](https://github.com/dskripchenko/ui) 的令牌——
其表面色、文字颜色、边框、强调色和状态色——以及它的组件来绘制。kit 显示什么主题，
本包就跟随什么主题：自定义的 kit 主题同样会改变它的样式。

## 暗色主题

无需任何设置。kit 通过 `<html>`（或任意祖先元素）上的 `data-theme` 属性切换主题，
而本包的颜色来自 kit 的令牌：

```html
<html data-theme="dark">
```

要跟随系统设置，请在应用中设置该属性——kit 的 `useTheme()` 就是做这件事的——
参考页和编辑器会随页面其余部分一起切换。

页面背景由宿主负责：在 `body` 或容器上设置，例如设为 kit 的 `--uid-surface-base`。

## 变量

本包自身的少数几项是 CSS 自定义属性。

| 变量 | 默认值 | 用途 |
|---|---|---|
| `--oa-sticky-top` | `0px` | 所有 sticky 元素——参考页的页头、导航和侧边标签页，编辑器的树——距顶部的偏移，以及锚点的滚动位置：设为宿主页面自己固定栏的高度。 |
| `--oa-viewport-h` | `100vh` | 参考页吸附导航所占的高度：设为参考页在其中滚动的框的高度。 |
| `--oa-source-height` | `560px` | 编辑器源码视图的高度。 |
| `--oa-header-h` | `56px` | 参考页页头的高度；导航、侧边标签页和锚点停在它下方。它声明在 `.oa-reference` 上：请在那里设置。 |
| `--oa-page-width` | `1440px` | [`OpenApiPage`](standalone.md#openapipage)：内容的最大宽度。 |
| `--oa-page-padding` | `24px` | `OpenApiPage`：标题栏和内容的左右内边距（宽度小于 640px 时为 16px）。 |
| `--oa-nav-width` | `272px` | 参考页导航栏的宽度。 |
| `--oa-gap` | `24px` | 栏与栏之间、操作内各块之间的间距。 |
| `--oa-radius` | `8px` | 面板的圆角半径。 |
| `--oa-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | 路径、类型和代码使用的等宽字体。 |
| `--oa-get` / `--oa-get-bg` | `var(--uid-info)` / `var(--uid-info-subtle)` | `GET` 标记：文字 / 背景。 |
| `--oa-post` / `--oa-post-bg` | `var(--uid-success)` / `var(--uid-success-subtle)` | `POST`。 |
| `--oa-put` / `--oa-put-bg` | `var(--uid-warning)` / `var(--uid-warning-subtle)` | `PUT`。 |
| `--oa-patch` / `--oa-patch-bg` | `var(--uid-warning)` / `var(--uid-warning-subtle)` | `PATCH`。 |
| `--oa-delete` / `--oa-delete-bg` | `var(--uid-danger)` / `var(--uid-danger-subtle)` | `DELETE`。 |
| `--oa-other` / `--oa-other-bg` | `var(--uid-text-secondary)` / `var(--uid-color-bg-subtle)` | `HEAD`、`OPTIONS`、`TRACE`。 |

## 在哪里设置

这些变量本身没有声明值——`--oa-header-h` 除外，见上文——每个默认值都是使用处的回退值。
可以在组件上、任一祖先元素上或 `:root` 上设置它们：

```css
:root {
  --oa-sticky-top: 64px;    /* the height of the site header */
}

.docs {
  --oa-nav-width: 320px;
  --oa-get: #0284c7;
  --oa-get-bg: #e0f2fe;
}

[data-theme='dark'] .docs {
  --oa-get: #7dd3fc;
  --oa-get-bg: #0c4a6e;
}
```

不改动方法颜色，它们就会在两种主题下都与 kit 的状态色保持一致。

## 代码颜色

代码块——请求示例、示例值、响应和编辑器的源码——使用 kit 的代码高亮及其
`--uid-code-tok-*` 令牌；请通过 kit 修改它们的样式。

## 类名

元素带有以 `oa-` 为前缀的稳定类名——`oa-reference`、`oa-header`、`oa-nav`、`oa-op`、
`oa-method oa-method--get`、`oa-schema`、`oa-tryit`、`oa-footer`、`oa-embed`、`oa-editor`
等——便于从外部设置样式。
操作和 schema 的锚点就是它们的元素 id：`operation/{id}` 和 `schema/{name}`。
