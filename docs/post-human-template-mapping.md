# Mapeamento do template pós-atendimento

O catálogo interno `casoAtualizacao` aponta para o template Meta aprovado
`caso_atualizacao_v3`, idioma `pt_BR`, categoria Utilidade.

O artefato de validação disponível no repositório confirma o nome, mas não
documenta variáveis ou componentes. Por segurança, o catálogo mantém esse
contrato como desconhecido e o envio falha antes do transporte. Os testes
injetam um contrato mock explícito; parâmetros não são inventados. Antes do
piloto real, a estrutura deve ser conferida de forma somente leitura no WABA e
este contrato atualizado.

O template legado `caso_atualizacao` não é usado pelo novo fluxo.
