<script setup lang="ts">
</script>
<template>
  <section class="w-full h-screen flex flex-col items-center justify-center relative overflow-hidden px-4">
    <!-- Decorative lines -->
    <div class="absolute top-[90px] left-0 right-0 h-px bg-gray-700/50" />

    <div class="max-w-2xl mx-auto text-center space-y-8">
      <h2 class="text-4xl md:text-5xl font-light text-white tracking-wider">关于项目</h2>

      <div class="bg-gray-900/60 border border-gray-800 rounded-xl p-8 space-y-4 text-left">
        <p class="text-gray-300 leading-relaxed">
          罗德之门（Ark Match）是一个专为<strong class="text-cyan-400">明日方舟</strong>玩家打造的同频交友平台。
          通过多维问卷评估，智能匹配与你兴趣、玩法和价值观相近的其他干员玩家。
        </p>
        <p class="text-gray-400 text-sm leading-relaxed">
          项目采用双轨制匹配：<strong class="text-white">FRIEND 交友模式</strong>（8个匹配维度）和
          <strong class="text-white">LOVE 恋爱模式</strong>（15个匹配维度），基于 Jaccard 相似度算法进行智能配对。
        </p>
        <p class="text-gray-400 text-sm leading-relaxed">
          技术栈：Vue 3 + TypeScript · Spring Boot WebFlux · MySQL + Redis · JWT 认证
        </p>
      </div>

      <div class="flex flex-wrap justify-center gap-4">
        <a href="https://github.com/Ark-Engineers/Ark-Match" target="_blank" rel="noopener"
           class="px-6 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white hover:bg-gray-700 transition cursor-pointer inline-flex items-center gap-2">
          <span class="text-white">GitHub</span>
          <span class="text-gray-500">&nearr;</span>
        </a>
      </div>

      <div class="space-y-1">
        <p class="text-gray-300 text-xs font-bold">Ark Match v0.2.0 &copy; 2026</p>
        <p class="text-gray-400 text-xs">背景图片版权归鹰角网络（Hypergryph）所有</p>
      </div>
    </div>
  </section>
</template>