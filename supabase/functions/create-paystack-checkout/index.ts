import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const paystackSecretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!paystackSecretKey || !supabaseUrl || !serviceRoleKey) throw new Error("Payment service is not configured.");

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user?.email) throw new Error("Sign in before starting payment.");

    const { paymentId, transactionId, amount, cashDueAmount = 0, currency = "ZAR", returnUrl } = await req.json();
    const amountNumber = Number(amount);
    if (!paymentId || !transactionId || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      throw new Error("Invalid payment request.");
    }

    const appUrl = req.headers.get("Origin") || "https://unimart-app-e2gaadawhwf6bng3.southafricanorth-01.azurewebsites.net";
    const callbackUrl = returnUrl || `${appUrl}/pages/messages.html`;
    const reference = `unimart-${String(paymentId).replace(/[^a-zA-Z0-9.-=]/g, "")}`;
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userData.user.email,
        amount: Math.round(amountNumber * 100),
        currency,
        reference,
        callback_url: `${callbackUrl}${callbackUrl.includes("?") ? "&" : "?"}payment=success&transaction=${transactionId}`,
        metadata: {
          paymentId,
          transactionId,
          cashDueAmount,
          userId: userData.user.id,
        },
        channels: ["card", "eft", "capitec_pay"],
      }),
    });

    const checkout = await response.json();
    if (!response.ok || !checkout.status) {
      throw new Error(checkout.message || checkout.error || "Payment checkout could not be created.");
    }

    const authorizationUrl = checkout.data?.authorization_url;
    const { data: payment, error: updateError } = await supabase
      .from("payment_records")
      .update({
        gateway_checkout_id: checkout.data?.reference || reference,
        checkout_url: authorizationUrl,
        status: "pending",
        raw_response: checkout,
        updated_at: new Date().toISOString(),
      })
      .eq("payment_id", paymentId)
      .select()
      .single();

    if (updateError) throw updateError;
    return Response.json({ redirectUrl: authorizationUrl, checkout: checkout.data, payment }, { headers: corsHeaders });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Payment failed" },
      { status: 400, headers: corsHeaders },
    );
  }
});
