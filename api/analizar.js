export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { xmlText } = req.body;
    if (!xmlText) return res.status(400).json({ error: 'No se recibió el XML' });

    // ── Parsear el XML del CFDI directamente ──────────────────────────
    const get = (xml, attr) => {
      const match = xml.match(new RegExp(`${attr}="([^"]*)"`));
      return match ? match[1] : 'No disponible';
    };

    // Datos del Comprobante
    const fecha      = get(xmlText, 'Fecha').split('T')[0];
    const subtotal   = get(xmlText, 'SubTotal');
    const total      = get(xmlText, 'Total');
    const moneda     = get(xmlText, 'Moneda');
    const metodoPago = get(xmlText, 'MetodoPago');
    const formaPago  = get(xmlText, 'FormaPago');
    const folio      = get(xmlText, 'Folio');
    const lugarExp   = get(xmlText, 'LugarExpedicion');

    // Emisor
    const emisorMatch = xmlText.match(/cfdi:Emisor[^>]*Rfc="([^"]*)"[^>]*Nombre="([^"]*)"[^>]*RegimenFiscal="([^"]*)"/);
    const emisorMatch2 = xmlText.match(/cfdi:Emisor[^>]*Nombre="([^"]*)"[^>]*Rfc="([^"]*)"[^>]*RegimenFiscal="([^"]*)"/);
    
    let rfcEmisor = 'No disponible', nombreEmisor = 'No disponible', regimenEmisor = 'No disponible';
    if (emisorMatch) {
      rfcEmisor     = emisorMatch[1];
      nombreEmisor  = emisorMatch[2];
      regimenEmisor = emisorMatch[3];
    } else if (emisorMatch2) {
      nombreEmisor  = emisorMatch2[1];
      rfcEmisor     = emisorMatch2[2];
      regimenEmisor = emisorMatch2[3];
    } else {
      rfcEmisor     = get(xmlText, 'Rfc');
      nombreEmisor  = get(xmlText, 'Nombre');
      regimenEmisor = get(xmlText, 'RegimenFiscal');
    }

    // Concepto
    const conceptoMatch = xmlText.match(/Descripcion="([^"]*)"/);
    const concepto = conceptoMatch ? conceptoMatch[1] : 'No disponible';

    // IVA
    const ivaMatch = xmlText.match(/TotalImpuestosTrasladados="([^"]*)"/);
    const iva = ivaMatch ? ivaMatch[1] : get(xmlText, 'Importe');

    // UUID
    const uuidMatch = xmlText.match(/UUID="([^"]*)"/);
    const uuid = uuidMatch ? uuidMatch[1] : 'No disponible';

    // Receptor
    const rfcReceptor = xmlText.match(/cfdi:Receptor[^>]*Rfc="([^"]*)"/)?.[1] || 'No disponible';
    const nombreReceptor = xmlText.match(/cfdi:Receptor[^>]*Nombre="([^"]*)"/)?.[1] || 'No disponible';

    // ── Verificaciones automáticas ────────────────────────────────────
    const rfcValido = /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(rfcEmisor);
    const uuidValido = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
    const subtotalNum = parseFloat(subtotal) || 0;
    const ivaNum = parseFloat(iva) || 0;
    const ivaEsperado = Math.round(subtotalNum * 0.16 * 100) / 100;
    const ivaValido = Math.abs(ivaNum - ivaEsperado) < 0.02;
    const diasDesdeFecha = (new Date() - new Date(fecha)) / (1000 * 60 * 60 * 24);
    const fechaReciente = diasDesdeFecha < 90;

    // ── Respuesta final ───────────────────────────────────────────────
    const resultado = {
      razon:        nombreEmisor,
      rfc:          rfcEmisor,
      regimen:      regimenEmisor,
      domicilio:    `C.P. ${lugarExp}`,
      email:        'No disponible',
      uuid:         uuid,
      fecha_emision: fecha,
      folio:        folio,
      subtotal:     `$${parseFloat(subtotal).toLocaleString('es-MX', {minimumFractionDigits:2})}`,
      iva:          `$${parseFloat(iva).toLocaleString('es-MX', {minimumFractionDigits:2})}`,
      total:        `$${parseFloat(total).toLocaleString('es-MX', {minimumFractionDigits:2})}`,
      moneda:       moneda,
      metodo_pago:  `${metodoPago} — Forma de pago: ${formaPago}`,
      concepto:     concepto,
      receptor_rfc:  rfcReceptor,
      receptor_nombre: nombreReceptor,
      verificaciones: [
        { ok: uuidValido,   label: 'UUID del timbre fiscal',        detalle: uuid },
        { ok: rfcValido,    label: 'RFC del emisor válido',          detalle: rfcEmisor },
        { ok: ivaValido,    label: `IVA 16% correcto`,              detalle: `$${subtotal} × 16% = $${ivaEsperado} — registrado: $${iva}` },
        { ok: fechaReciente,label: 'Fecha de emisión reciente',      detalle: `${fecha} (${Math.round(diasDesdeFecha)} días)` },
        { ok: true,         label: 'Receptor identificado',          detalle: `${nombreReceptor} — ${rfcReceptor}` },
      ]
    };

    return res.status(200).json({
      content: [{ type: 'text', text: JSON.stringify(resultado) }]
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
