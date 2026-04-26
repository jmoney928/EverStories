const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const TIERS = {
  card:     { name: 'EverStories Card',               price: 15000 },
  keepsake: { name: 'EverStories Keepsake Collection', price: 25000 },
  frame:    { name: 'EverStories Living Story Frame',  price: 35000 },
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tier, email } = req.body;
  const product = TIERS[tier];

  if (!product) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  try {
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'cad',
          product_data: { name: product.name },
          unit_amount: product.price,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/thanks.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout.html?tier=${tier}`,
      customer_email: email || undefined,
      shipping_address_collection: { allowed_countries: ['CA'] },
      billing_address_collection: 'required',
      phone_number_collection: { enabled: true },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
