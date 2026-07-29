# Reversão operacional

Esta migration é aditiva. O rollback seguro é:

1. desligar `POST_HUMAN_COMPLEMENTATION_ENABLED`;
2. confirmar que não há processamento em curso;
3. preservar/exportar `post_human_cycles` para auditoria;
4. remover a função `create_post_human_cycle` somente após aprovação;
5. manter a tabela até o encerramento da retenção e revisão jurídica.

Não executar `DROP TABLE` automaticamente. Qualquer remoção exige autorização
humana, backup verificado e janela de manutenção.
