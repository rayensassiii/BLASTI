// ============================================================================
// BLASTI - Supabase Edge Function: verify-boarding
// ============================================================================
// Endpoint sécurisé permettant au conducteur de scanner le QR code passager.
// Compare l'empreinte SHA-256 du token, valide le trajet, vérifie l'unicité
// et met à jour atomiquement la réservation et les sièges.
// ============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestion CORS pre-flight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Vérification de l'utilisateur authentifié
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, code: 'UNAUTHORIZED', message: 'Non authentifié' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { journey_id, qr_token } = await req.json()

    if (!journey_id || !qr_token) {
      return new Response(
        JSON.stringify({ success: false, code: 'BAD_REQUEST', message: 'Paramètres journey_id et qr_token requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Appel de la fonction PostgreSQL transactionnelle sécurisée
    const { data, error } = await supabaseClient.rpc('scan_boarding_qr', {
      p_journey_id: journey_id,
      p_qr_token: qr_token,
    })

    if (error) {
      return new Response(
        JSON.stringify({ success: false, code: 'RPC_ERROR', message: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return new Response(
      JSON.stringify({ success: false, code: 'SERVER_ERROR', message: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
