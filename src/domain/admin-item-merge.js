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
    from: itemMemoria.from && String(itemMemoria.from).trim() ? itemMemoria.from : itemHubspot.from,
    u: mergedU,
    negocio: itemHubspot.negocio,
    contato: itemHubspot.contato
  };

  return merged;
}

module.exports = { mesclarItemAdminHubspotComMemoria };
