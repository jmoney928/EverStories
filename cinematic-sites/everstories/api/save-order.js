const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  const {
    tier, occasion, recipientName, senderName,
    personalMessage, storyContext,
    deliveryFirst, deliveryLast, deliveryEmail,
    deliveryAddress, deliveryCity, deliveryProvince,
    deliveryPostal, deliveryNote, photoCount
  } = req.body;

  const { data, error } = await supabase
    .from('orders')
    .insert([{
      tier,
      occasion,
      recipient_name: [recipientName, senderName ? `(from ${senderName})` : ''].filter(Boolean).join(' '),
      personal_message: personalMessage,
      story_context: storyContext,
      delivery_name: `${deliveryFirst || ''} ${deliveryLast || ''}`.trim(),
      delivery_email: deliveryEmail,
      delivery_address: deliveryAddress,
      delivery_city: deliveryCity,
      delivery_province: deliveryProvince,
      delivery_postal: deliveryPostal,
      status: 'pending'
    }])
    .select('id')
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }

  const orderId = data.id;
  const uploadUrls = [];

  for (let i = 0; i < Math.min(photoCount || 0, 20); i++) {
    const path = `${orderId}/photo-${i}`;
    const { data: urlData, error: urlErr } = await supabase.storage
      .from('order-photos')
      .createSignedUploadUrl(path);

    if (!urlErr && urlData) {
      uploadUrls.push({ index: i, path, signedUrl: urlData.signedUrl });
    }
  }

  res.status(200).json({ orderId, uploadUrls });
};
