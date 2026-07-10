require('dotenv').config()
const axios = require('axios')
const fs = require('fs')
const path = require('path')

const HS_TOKEN = process.env.HUBSPOT_TOKEN || process.env.HUBSPOT_API_KEY
const USERS_FILE = path.join(__dirname, '..', '..', 'data', 'users-state.json')
const AUDIOS_DIR = path.join(__dirname, '..', '..', 'audios', 'atendentes')

if (!HS_TOKEN) {
  console.error('Erro: HUBSPOT_TOKEN ou HUBSPOT_API_KEY não encontrado no .env')
  process.exit(1)
}

const client = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: {
    Authorization: `Bearer ${HS_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 20000
})

async function deletarNegocio(id) {
  if (!id) return
  try {
    console.log(`Deletando negócio: ${id}`)
    await client.delete(`/crm/v3/objects/deals/${encodeURIComponent(id)}`)
    console.log(`Negócio ${id} deletado com sucesso.`)
  } catch (error) {
    console.error(`Falha ao deletar negócio ${id}:`, error.response?.data || error.message)
  }
}

async function deletarContato(id) {
  if (!id) return
  try {
    console.log(`Deletando contato: ${id}`)
    await client.delete(`/crm/v3/objects/contacts/${encodeURIComponent(id)}`)
    console.log(`Contato ${id} deletado com sucesso.`)
  } catch (error) {
    console.error(`Falha ao deletar contato ${id}:`, error.response?.data || error.message)
  }
}

async function apagarAudios() {
  try {
    const arquivos = await fs.promises.readdir(AUDIOS_DIR)
    const promessas = arquivos.map(async arquivo => {
      const fullPath = path.join(AUDIOS_DIR, arquivo)
      const stats = await fs.promises.stat(fullPath)
      if (stats.isFile()) {
        await fs.promises.unlink(fullPath)
        console.log(`Apagado áudio: ${arquivo}`)
      }
    })
    await Promise.all(promessas)
    console.log('Todos os arquivos de áudio em audios/atendentes/ foram apagados.')
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('Diretório de áudios não encontrado:', AUDIOS_DIR)
      return
    }
    console.error('Erro ao apagar áudios:', error.message)
  }
}

async function main() {
  let usersState = {}

  try {
    const json = await fs.promises.readFile(USERS_FILE, 'utf8')
    usersState = JSON.parse(json || '{}')
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn('Arquivo users-state.json não encontrado, criando um novo arquivo vazio.')
    } else {
      console.error('Erro ao ler users-state.json:', error.message)
      process.exit(1)
    }
  }

  const contatos = Object.values(usersState).filter(u => u && (u.contatoId || u.negocioId))
  console.log(`Encontrados ${contatos.length} usuários com contatoId ou negocioId.`)

  for (const usuario of contatos) {
    const telefone = usuario._numero || usuario.numero || usuario.telefone || 'sem-numero'
    console.log(`Processando usuário: ${telefone}`)
    if (usuario.negocioId) {
      await deletarNegocio(usuario.negocioId)
    }
    if (usuario.contatoId) {
      await deletarContato(usuario.contatoId)
    }
  }

  try {
    await fs.promises.writeFile(USERS_FILE, '{}', 'utf8')
    console.log('Arquivo users-state.json limpo com sucesso.')
  } catch (error) {
    console.error('Erro ao limpar users-state.json:', error.message)
  }

  await apagarAudios()
}

main().catch(error => {
  console.error('Erro inesperado:', error)
  process.exit(1)
})
