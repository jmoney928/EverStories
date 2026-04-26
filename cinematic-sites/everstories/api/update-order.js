const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const { orderId, stripeSessionId, photoUrls } = req.body;

  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

  const updates = { status: 'paid' };
  if (stripeSessionId) updates.stripe_session_id = stripeSessionId;
  if (photoUrls && photoUrls.length) updates.photo_urls = photoUrls;

  const { error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ success: true });
};
