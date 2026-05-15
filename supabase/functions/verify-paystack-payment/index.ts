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
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Sign in before verifying payment.");

    const { transactionId, reference } = await req.json();
    if (!transactionId) throw new Error("Missing transaction.");

    let paymentQuery = supabase
      .from("payment_records")
      .select("*")
      .eq("transaction_id", transactionId)
      .eq("gateway", "paystack")
      .order("created_at", { ascending: false })
      .limit(1);
    if (reference) paymentQuery = paymentQuery.eq("gateway_checkout_id", reference);

    const { data: payments, error: paymentError } = await paymentQuery;
    if (paymentError) throw paymentError;
    const payment = payments?.[0];
    if (!payment) throw new Error("Payment record not found.");
    if (payment.buyer_id !== userData.user.id) throw new Error("Only the buyer can verify this payment.");

    const paystackReference = reference || payment.gateway_checkout_id;
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paystackReference)}`, {
      headers: { Authorization: `Bearer ${paystackSecretKey}` },
    });
    const verification = await response.json();
    if (!response.ok || !verification.status) throw new Error(verification.message || "Payment could not be verified.");

    const paid = verification.data?.status === "success";
    const paidAmount = Number(verification.data?.amount || 0) / 100;
    const cashDueAmount = Number(payment.cash_due_amount || 0);
    const transactionStatus = paid
      ? (cashDueAmount > 0 ? "partial_paid" : "paid")
      : "failed";

    const [{ data: updatedPayment, error: updatePaymentError }, { data: updatedTransaction, error: updateTransactionError }] = await Promise.all([
      supabase
        .from("payment_records")
        .update({
          status: paid ? "paid" : "failed",
          gateway_payment_id: verification.data?.id ? String(verification.data.id) : null,
          raw_response: verification,
          updated_at: new Date().toISOString(),
        })
        .eq("payment_id", payment.payment_id)
        .select()
        .single(),
      supabase
        .from("transactions")
        .update({
          payment_status: transactionStatus,
          online_paid_amount: paid ? paidAmount : 0,
          cash_due_amount: paid ? cashDueAmount : Number(payment.amount || 0) + cashDueAmount,
          payment_gateway: "paystack",
          payment_reference: paystackReference,
          updated_at: new Date().toISOString(),
        })
        .eq("transaction_id", transactionId)
        .select()
        .single(),
    ]);

    if (updatePaymentError) throw updatePaymentError;
    if (updateTransactionError) throw updateTransactionError;

    return Response.json({ payment: updatedPayment, transaction: updatedTransaction, verification }, { headers: corsHeaders });
  } catch (err) {
    console.error("verify-paystack-payment failed", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Payment verification failed" },
      { status: 400, headers: corsHeaders },
    );
  }
});
