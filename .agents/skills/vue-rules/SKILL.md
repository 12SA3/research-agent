---
name: vue-rules
description: 当用户在对一个vue项目进行开发式，或者让你生成vue代码时，调用此skill
---

#核心原则
1，优先使用vue3语法
2，弹窗的创建参考下面模板
```vue
<script setup lang="ts">
import myDialog from "my-com"
</script>

<template>
  <my-dialog></my-dialog>
</template>

<style lang="less" scoped></style>
```
 
