module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: 'Missing API key' });

  var b = req.body;
  if (!b || !b.firstName || !b.lastName || !b.phone || !b.email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Parse vehicle name: "2025 Jeep Grand Cherokee L Altitude" → year, make, model
  var year = '';
  var make = '';
  var model = '';
  var vehicle = (b.vehicle || '').trim();
  var parts = vehicle.split(/\s+/);
  if (parts.length >= 3 && /^\d{4}$/.test(parts[0])) {
    year = parts[0];
    make = parts[1];
    model = parts.slice(2).join(' ');
  } else if (parts.length >= 2) {
    make = parts[0];
    model = parts.slice(1).join(' ');
  } else {
    model = vehicle;
  }

  var now = new Date().toISOString().replace('Z', '-00:00');

  var comments = [
    b.notes || '',
    'Appointment: ' + (b.appointmentDateTime || 'Not specified'),
    'Preferred Contact Time: ' + (b.contactTime || 'Anytime'),
    'Vehicle Details: ' + vehicle + (b.stock ? ' — Stk #' + b.stock : '') + (b.price ? ' — ' + b.price : '') + (b.terms ? ' — ' + b.terms : '')
  ].join('\n');

  var adf = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<?adf version="1.0"?>\n'
    + '<adf>\n'
    + '  <prospect>\n'
    + '    <requestdate>' + now + '</requestdate>\n'
    + '    <vehicle interest="test-drive" status="new">\n'
    + (year ? '      <year>' + esc(year) + '</year>\n' : '')
    + '      <make>' + esc(make) + '</make>\n'
    + '      <model>' + esc(model) + '</model>\n'
    + (b.stock ? '      <stock>' + esc(b.stock) + '</stock>\n' : '')
    + '    </vehicle>\n'
    + '    <customer>\n'
    + '      <contact>\n'
    + '        <name part="first">' + esc(b.firstName) + '</name>\n'
    + '        <name part="last">' + esc(b.lastName) + '</name>\n'
    + '        <phone type="phone">' + esc(b.phone) + '</phone>\n'
    + '        <email>' + esc(b.email) + '</email>\n'
    + (b.zip ? '        <address>\n          <postalcode>' + esc(b.zip) + '</postalcode>\n        </address>\n' : '')
    + '      </contact>\n'
    + '      <comments>' + esc(comments) + '</comments>\n'
    + '    </customer>\n'
    + '    <vendor>\n'
    + '      <vendorname>Gallatin CDJR</vendorname>\n'
    + '      <contact>\n'
    + '        <name part="full">Gallatin CDJR</name>\n'
    + '        <phone type="phone">615-451-1920</phone>\n'
    + '        <address>\n'
    + '          <street line="1">1290 Nashville Pike</street>\n'
    + '          <city>Gallatin</city>\n'
    + '          <regioncode>TN</regioncode>\n'
    + '          <postalcode>37066</postalcode>\n'
    + '        </address>\n'
    + '      </contact>\n'
    + '    </vendor>\n'
    + '    <provider>\n'
    + '      <name part="full">Sign &amp; Drive Campaign</name>\n'
    + '      <url>https://sign-and-drive.campaignsatgallatincdjr.com</url>\n'
    + '    </provider>\n'
    + '  </prospect>\n'
    + '</adf>';

  var fullName = b.firstName + ' ' + b.lastName;

  try {
    var response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + RESEND_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Campaign Leads <leads@campaignsatgallatincdjr.com>',
        to: ['campaignleads@drivegallatincdjr.com'],
        subject: 'ADF Lead — Test Drive — ' + fullName,
        text: adf
      })
    });

    var result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      return res.status(502).json({ error: 'Email delivery failed' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Send error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
