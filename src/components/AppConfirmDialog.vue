<template>
  <Dialog :visible="state !== null" modal :header="state?.header || ''" style="width: 460px"
          :closable="true" @update:visible="() => onCancel()" @show="resetDraft">
    <template #closeicon>
      <i class="pi pi-times" aria-label="Отмена" />
    </template>

    <div v-if="state" class="confirm-body">
      <p v-if="state.message" class="confirm-message">{{ state.message }}</p>

      <label v-if="state.inputLabel" class="confirm-field">
        {{ state.inputLabel }}
        <InputText v-model="draft" class="w100" :placeholder="state.inputPlaceholder"
                   @keyup.enter="onOk" />
      </label>

      <div v-if="state.choices" class="confirm-choices">
        <SelectButton v-model="draft" :options="state.choices" option-label="label"
                      option-value="value" />
      </div>
    </div>

    <template #footer>
      <div class="confirm-footer">
        <Button label="Отмена" severity="secondary" text @click="onCancel()" />
        <Button :label="state?.okLabel || 'ОК'"
                :severity="state?.danger ? 'danger' : undefined"
                :disabled="state?.choices && draft === ''" @click="onOk" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import { useAppConfirm } from '../composables/useAppConfirm'

const { state } = useAppConfirm()
const draft = ref('')

function resetDraft() {
  draft.value = state.value?.choices ? '' : ''
}

function onOk() {
  if (!state.value) return
  if (state.value.choices && draft.value === '') return
  state.value.resolve(draft.value)
  state.value = null
}

/** отмена: крестик, Esc, кнопка «Отмена» — действие не выполняется */
function onCancel() {
  state.value?.resolve(null)
  state.value = null
}
</script>

<style scoped>
.confirm-body { display: flex; flex-direction: column; gap: 10px; }
.confirm-message { margin: 0; font-size: 0.9rem; white-space: pre-wrap; }
.confirm-field { display: flex; flex-direction: column; gap: 6px; font-size: 0.85rem; }
.confirm-footer { display: flex; gap: 10px; justify-content: flex-end; }
.w100 { width: 100%; box-sizing: border-box; }
</style>
