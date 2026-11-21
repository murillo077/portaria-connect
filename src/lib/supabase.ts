import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
export const isSupabaseConfigured = Boolean(url && key && !url.includes('SEU-PROJETO'))
export const supabase = isSupabaseConfigured ? createClient(url!, key!) : null

export type DeliveryStatus = 'received' | 'collected'
export type Delivery = {
  id: string
  recipient_name: string
  block: string
  apartment: string
  description: string | null
  photo_url: string | null
  status: DeliveryStatus
  received_at: string
  collected_at: string | null
  collected_by: string | null
}