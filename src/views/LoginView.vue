<template>
  <div class="login">
    <Card style="width: 380px">
      <template #title>Perf Review Tool</template>
      <template #content>
        <div v-if="mode === 'dev'" class="flex-col gap-8">
          <label class="flex-col">
            <span>Email</span>
            <InputText v-model="email" placeholder="you@itgri.ru" />
          </label>
          <label class="flex-col">
            <span>Роль (локальный режим)</span>
            <Dropdown v-model="role" :options="roles" @change="onRoleChange" />
          </label>
          <Button label="Войти" :loading="busy" @click="login" />
          <small class="muted">Роль применяется к вашему пользователю в локальной БД.</small>
        </div>
        <div v-else class="flex-col gap-8">
          <p class="muted">Вход через корпоративный Keycloak.</p>
          <Button label="Войти через SSO" :loading="busy" @click="login" />
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Dropdown from 'primevue/dropdown'
import { homeForRole } from '../router'
import { useAuth } from '../stores/auth'
import { errMsg } from '../api'
import { useToast } from 'primevue/usetoast'

const auth = useAuth()
const router = useRouter()
const toast = useToast()
const mode = ref('dev')
const email = ref('admin@itgri.ru')
const role = ref('admin')
// ВРЕМЕННО (выпилю): employee в dev-режиме — тест под Дзюбой
const DZUBA = 'dziuba_v_s@itgri.ru'

function onRoleChange() {
  if (role.value === 'employee' && email.value === 'admin@itgri.ru') {
    email.value = DZUBA
  }
}
const roles = ['admin', 'cto', 'line-manager', 'functional-manager', 'employee']
const busy = ref(false)

onMounted(async () => {
  mode.value = await auth.loadAuthMode()
})

async function login() {
  busy.value = true
  try {
    if (mode.value === 'dev') {
      await auth.devLogin(email.value.trim().toLowerCase(), role.value)
    } else {
      window.location.href = '/api/v1/auth/login-redirect'
      return
    }
    router.replace('/dashboard')
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Не удалось войти', detail: errMsg(e), life: 5000 })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.login { height: 100vh; display: flex; align-items: center; justify-content: center; }
.flex-col { display: flex; flex-direction: column; gap: 10px; }
.gap-8 { gap: 12px; }
</style>
