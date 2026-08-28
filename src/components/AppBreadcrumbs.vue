<template>
  <nav v-if="items.length" class="crumbs">
    <template v-for="(item, i) in items" :key="i">
      <router-link v-if="item.to && i < items.length - 1" :to="item.to" class="crumb-link">
        {{ item.label }}
      </router-link>
      <span v-else class="crumb-current">{{ item.label }}</span>
      <i v-if="i < items.length - 1" class="pi pi-angle-right sep" />
    </template>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ items: { label: string; to?: string }[] }>()
</script>

<style scoped>
.crumbs { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; margin-bottom: 10px; flex-wrap: wrap; }
.crumb-link { color: #64748b; text-decoration: none; }
.crumb-link:hover { color: #1e293b; text-decoration: underline; }
.crumb-current { color: #1e293b; font-weight: 600; }
.sep { font-size: 0.7rem; color: #cbd5e1; }
</style>
