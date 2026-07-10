# Scripts auxiliares

Os scripts estão organizados pela finalidade:

- `development/`: utilitários manuais de desenvolvimento;
- `maintenance/`: rotinas destrutivas ou de manutenção de estado;
- `local/`: diagnósticos locais com identificadores reais, ignorados pelo Git.

Os scripts mantidos diretamente em `scripts/` são entrypoints referenciados por
`package.json`, testes ou manifests arquiteturais. Eles não devem ser movidos sem
uma mudança coordenada nesses contratos.

## Segurança

Scripts de `maintenance/` podem apagar estado, áudios ou registros remotos.
Executá-los somente com backup, ambiente confirmado e autorização operacional.
