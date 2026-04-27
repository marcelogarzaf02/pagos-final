export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada en Vercel' });

  try {
    const { xmlText, pdfBase64 } = req.body;

    // Construir el contenido para Claude
    const content = [];

    // Si viene el XML como texto plano, mandarlo directamente
    if (xmlText) {
      content.push({
        type: 'text',
        text: `Este es el contenido exacto del archivo XML del CFDI. Lee ÚNICAMENTE los valores que aparecen aquí, no inventes ni asumas nada:\n\n${xmlText}`
      });
    }

    // Si viene el PDF en base64
    if (pdfBase64) {
      content.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfBase64
        }
      });
    }

    content.push({
      type: 'text',
      text: `Extrae los datos del CFDI. USA ÚNICAMENTE los valores que aparecen literalmente en el XML de arriba.
NO inventes, NO asumas, NO uses datos de ejemplo.

Busca en el XML estos atributos exactos:
- cfdi:Emisor Nombre="..." → va en "razon"
- cfdi:Emisor Rfc="..." → va en "rfc"  
- cfdi:Emisor RegimenFiscal="..." → va en "regimen"
- cfdi:Comprobante Fecha="..." → va en "fecha_emision"
- cfdi:Comprobante SubTotal="..." → va en "subtotal"
- cfdi:Comprobante Total="..." → va en "total"
- cfdi:Comprobante Moneda="..." → va en "moneda"
- cfdi:Comprobante MetodoPago="..." → va en "metodo_pago"
- tfd:TimbreFiscalDigital UUID="..." → va en "uuid"
- cfdi:Concepto Descripcion="..." → va en "concepto"
- El IVA está en cfdi:Traslado Importe="..." dentro de cfdi:Impuestos

Devuelve SOLO este JSON sin markdown, sin texto extra:
{"razon":"","rfc":"","regimen":"","domicilio":"","email":"","uuid":"","fecha_emision":"","subtotal":"","iva":"","total":"","moneda":"","metodo_pago":"","concepto":"","verificaciones":[{"ok":true,"label":"UUID válido","detalle":""},{"ok":true,"label":"RFC válido","detalle":""},{"ok":true,"label":"IVA correcto","detalle":""},{"ok":true,"label":"Fecha reciente","detalle":""},{"ok":true,"label":"Datos completos","detalle":""}]}`
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content }],
      }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
