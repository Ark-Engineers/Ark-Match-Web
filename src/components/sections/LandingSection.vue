<script setup lang="ts">
const emit = defineEmits<{ quickStart: [] }>()
</script>

<template>
  <!-- 设计稿「罗德主页」布局：左下大面板 + 右下窄面板（占比按 1440x1024 稿换算） -->
  <section class="w-full h-screen relative overflow-hidden">
    <!-- 左下面板：x0-627/y269-1024 → 宽 43.5%、高 73.8%、贴底 -->
    <div class="absolute left-0 bottom-0 w-[43.5%] h-[73.8%] bg-[#CCCCCC]/90 backdrop-blur-[2px] overflow-hidden">
      <!-- 巨型装饰大字（设计稿 VECTOR 文本，白色，超出画布） -->
      <div
        class="absolute left-[-6%] top-[50%] w-[130%] select-none whitespace-nowrap font-black text-white/[0.94] leading-none"
        style="font-size: clamp(75px, 8vw, 220px); letter-spacing: 0.02em;"
        aria-hidden="true"
      >DATE OR FRIENDS</div>

      <!-- 青色 CTA：设计稿 (97,422) 337x90，位于面板上部 -->
      <button
        class="absolute left-[15.5%] top-[19.5%] w-[53.7%] max-w-[420px] aspect-[337/90] bg-[#16B8E0] hover:bg-[#2ac6ea] text-white/90 font-bold rounded-xl transition-all duration-300 hover:shadow-xl hover:shadow-[#16B8E0]/40 cursor-pointer active:scale-95 flex items-center justify-center"
        style="font-size: clamp(20px, 2.6vw, 36px); letter-spacing: 0.15em;"
        @click="emit('quickStart')"
      >快速开始&gt;&gt;</button>

      <!-- 大标题「罗德之门」：设计稿 (70,832) 412x145，位于面板下部、下横线之下 -->
      <h1
        class="absolute left-[11%] bottom-[8%] text-white font-black leading-none select-none"
        style="font-size: clamp(56px, 8.2vw, 140px); letter-spacing: 0.06em;"
      >罗德之门</h1>
    </div>

    <!-- 右下窄面板：x1160-1440/y269-1024 → 宽 19.4%、贴底 -->
    <div class="absolute right-0 bottom-0 w-[19.4%] h-[73.8%] bg-[#CCCCCC]/90 backdrop-blur-[2px] overflow-hidden">
      <!-- 面板内容：口号竖排装饰 -->
      <div class="h-full flex items-center justify-center">
        <p
          class="text-[#2b2b2b] font-bold tracking-[0.5em] select-none"
          style="writing-mode: vertical-rl; font-size: clamp(14px, 1.3vw, 20px);"
        >DATE OR FRIENDS · 罗德之门</p>
      </div>
    </div>

    <!-- 滚动提示 -->
    <div class="absolute bottom-6 left-[52%] flex flex-col items-center gap-1.5 text-white/40 text-xs animate-bounce pointer-events-none">
      <span class="w-3.5 h-3.5 border-r-2 border-b-2 border-white/40 rotate-45" />
      <span>向下滚动</span>
    </div>
  </section>
</template>