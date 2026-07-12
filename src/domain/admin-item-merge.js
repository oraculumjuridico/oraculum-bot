const { normalizarNumeroWhatsAppEnvio } = require("./phone-name")

function mesclarItemAdminHubspotComMemoria(itemHubspot, itemMemoria) {
  if (!itemHubspot || !itemHubspot.u) {
    return itemMemoria;
  }
  if (!itemMemoria || !itemMemoria.u) {
    return itemHubspot;
  }

  const hsU = itemHubspot.u;
  const localU = itemMemoria.u;

  const mergedU = { ...hsU };

  const fieldsAllowed = [
    'stage',
    'numeroCaso',
    'nome',
    'nomeWA',
    'nomePerfilWhatsApp',
    'nomeConfirmado',
    'documentos',
    'documentosRecebidos',
    'documentosPendentes',
    'consultaStatus',
    'urgencia',
    'ultimaInteracao'
  ];

  for (const field of fieldsAllowed) {
    const localValue = localU[field];
    if (localValue !== null && localValue !== undefined && localValue !== '') {
      if (field.includes('documentos') && !Array.isArray(localValue)) {
        continue;
      }
      mergedU[field] = localValue;
    }
  }

  const localKeys = Object.keys(localU);
  for (const key of localKeys) {
    if (key.startsWith('_')) {
      const localValue = localU[key];
      if (localValue !== null && localValue !== undefined && localValue !== '') {
        mergedU[key] = localValue;
      }
    }
  }

  const merged = {
    ...itemHubspot,
    from: itemMemoria.from && String(itemMemoria.from).trim() ? itemMemoria.from : itemHubspot.from,
    u: mergedU,
    negocio: itemHubspot.negocio,
    contato: itemHubspot.contato
  };

  return merged;
}

function telefoneIdentidadeAdmin(item = {}) {
  const normalizado = normalizarNumeroWhatsAppEnvio(
    item?.from || item?.u?._numero || item?.u?.whatsappContato
  )
  return /^55\d{10,11}$/.test(normalizado) ? normalizado : ""
}

function contarPorTelefone(itens = []) {
  const contagens = new Map()
  for (const item of itens) {
    const telefone = telefoneIdentidadeAdmin(item)
    if (telefone) contagens.set(telefone, (contagens.get(telefone) || 0) + 1)
  }
  return contagens
}

function negocioIdAdmin(item = {}) {
  return String(item?.u?.negocioId || item?.negocio?.id || "").trim()
}

function contarPorNegocioId(itens = []) {
  const contagens = new Map()
  for (const item of itens) {
    const negocioId = negocioIdAdmin(item)
    if (negocioId) contagens.set(negocioId, (contagens.get(negocioId) || 0) + 1)
  }
  return contagens
}

function mesclarItensAdminPorIdentidade(itensHubspot = [], itensLocais = []) {
  const hubspot = Array.isArray(itensHubspot) ? itensHubspot : []
  const locais = Array.isArray(itensLocais) ? itensLocais : []
  const resultado = [...hubspot]
  const hubspotPorNegocioId = contarPorNegocioId(hubspot)
  const locaisPorNegocioId = contarPorNegocioId(locais)
  const hubspotPorTelefone = contarPorTelefone(hubspot)
  const locaisPorTelefone = contarPorTelefone(locais)
  const hubspotConsumidos = new Set()
  const locaisConsumidos = new Set()

  for (const [indiceLocal, itemLocal] of locais.entries()) {
    const negocioId = String(itemLocal?.u?.negocioId || "").trim()
    if (!negocioId) continue
    const correspondenciaUnica = hubspotPorNegocioId.get(negocioId) === 1 &&
      locaisPorNegocioId.get(negocioId) === 1
    if (!correspondenciaUnica) continue
    const indiceHubspot = hubspot.findIndex(item => negocioIdAdmin(item) === negocioId)
    if (indiceHubspot < 0 || hubspotConsumidos.has(indiceHubspot)) continue
    resultado[indiceHubspot] = mesclarItemAdminHubspotComMemoria(resultado[indiceHubspot], itemLocal)
    hubspotConsumidos.add(indiceHubspot)
    locaisConsumidos.add(indiceLocal)
  }

  for (const [indiceLocal, itemLocal] of locais.entries()) {
    if (locaisConsumidos.has(indiceLocal)) continue
    if (String(itemLocal?.u?.negocioId || "").trim()) continue
    const telefone = telefoneIdentidadeAdmin(itemLocal)
    const correspondenciaUnica = telefone &&
      locaisPorTelefone.get(telefone) === 1 &&
      hubspotPorTelefone.get(telefone) === 1
    if (!correspondenciaUnica) continue
    const indiceHubspot = hubspot.findIndex(item => telefoneIdentidadeAdmin(item) === telefone)
    if (indiceHubspot < 0 || hubspotConsumidos.has(indiceHubspot)) continue
    resultado[indiceHubspot] = mesclarItemAdminHubspotComMemoria(resultado[indiceHubspot], itemLocal)
    hubspotConsumidos.add(indiceHubspot)
    locaisConsumidos.add(indiceLocal)
  }

  for (const [indiceLocal, itemLocal] of locais.entries()) {
    if (!locaisConsumidos.has(indiceLocal)) resultado.push(itemLocal)
  }

  return resultado
}

module.exports = {
  mesclarItemAdminHubspotComMemoria,
  mesclarItensAdminPorIdentidade
};
