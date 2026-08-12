function numeroPorExtenso(n, genero = "masculino") {
  const masculino = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez"]
  const feminino  = ["zero","uma","duas","três","quatro","cinco","seis","sete","oito","nove","dez"]
  if (n >= 0 && n <= 10) return genero === "feminino" ? feminino[n] : masculino[n]
  const especiais = { 11: "onze", 12: "doze", 13: "treze", 14: "quatorze", 15: "quinze", 16: "dezesseis", 17: "dezessete", 18: "dezoito", 19: "dezenove", 20: "vinte", 21: "vinte e um", 22: "vinte e dois", 23: "vinte e três", 24: "vinte e quatro", 25: "vinte e cinco", 26: "vinte e seis", 27: "vinte e sete", 28: "vinte e oito", 29: "vinte e nove", 30: "trinta", 31: "trinta e um", 45: "quarenta e cinco" }
  if (Object.prototype.hasOwnProperty.call(especiais, n)) return especiais[n]
  return String(n)
}

// Formata slot para exibição no WhatsApp
function formatarSlot(date) {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"]
  const dia = dias[date.getDay()]
  const num = date.getDate()
  const mes = meses[date.getMonth()]
  const hora = String(date.getHours()).padStart(2, "0")
  return `${dia} ${num}/${mes} às ${hora}h`
}

// Formata slot para o áudio
function horaPorExtensoAudio(date) {
  const hora = date.getHours()
  const minuto = date.getMinutes()
  const mapaHoras = {
    0: "meia-noite",
    1: "uma hora",
    2: "duas horas",
    3: "três horas",
    4: "quatro horas",
    5: "cinco horas",
    6: "seis horas",
    7: "sete horas",
    8: "oito horas",
    9: "nove horas",
    10: "dez horas",
    11: "onze horas",
    12: "meio-dia",
    13: "treze horas",
    14: "quatorze horas",
    15: "quinze horas",
    16: "dezesseis horas",
    17: "dezessete horas",
    18: "dezoito horas",
    19: "dezenove horas",
    20: "vinte horas",
    21: "vinte e uma horas",
    22: "vinte e duas horas",
    23: "vinte e três horas"
  }
  const base = mapaHoras[hora] || `${hora} horas`
  if (!minuto) return base
  return `${base} e ${numeroPorExtenso(minuto)} minutos`
}

function formatarSlotAudio(date) {
  const dias = ["domingo", "segunda feira", "terça feira",
                "quarta feira", "quinta feira", "sexta feira", "sábado"]
  const meses = ["janeiro","fevereiro","março","abril","maio","junho",
                 "julho","agosto","setembro","outubro","novembro","dezembro"]
  const dia = dias[date.getDay()]
  const num = date.getDate()
  const mes = meses[date.getMonth()]
  return `${dia}, ${numeroPorExtenso(num)} de ${mes}, às ${horaPorExtensoAudio(date)}`
}

module.exports = {
  numeroPorExtenso,
  formatarSlot,
  horaPorExtensoAudio,
  formatarSlotAudio
}
