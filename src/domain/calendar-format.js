function numeroPorExtenso(n, genero = "masculino") {
  const masculino = ["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez"]
  const feminino  = ["zero","uma","duas","três","quatro","cinco","seis","sete","oito","nove","dez"]
  if (n >= 0 && n <= 10) return genero === "feminino" ? feminino[n] : masculino[n]
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
    13: "uma hora",
    14: "duas horas",
    15: "três horas",
    16: "quatro horas",
    17: "cinco horas",
    18: "seis horas",
    19: "sete horas",
    20: "oito horas",
    21: "nove horas",
    22: "dez horas",
    23: "onze horas"
  }
  const turno = hora >= 5 && hora < 12
    ? "da manhã"
    : hora >= 12 && hora < 18
    ? "da tarde"
    : hora >= 18
    ? "da noite"
    : "da madrugada"

  const base = mapaHoras[hora] || `${hora} horas`
  const complementoTurno = hora === 0 || hora === 12 ? "" : ` ${turno}`
  if (!minuto) return `${base}${complementoTurno}`
  return `${base} e ${numeroPorExtenso(minuto)} minutos${complementoTurno}`
}

function formatarSlotAudio(date) {
  const dias = ["domingo", "segunda feira", "terça feira",
                "quarta feira", "quinta feira", "sexta feira", "sábado"]
  const meses = ["janeiro","fevereiro","março","abril","maio","junho",
                 "julho","agosto","setembro","outubro","novembro","dezembro"]
  const dia = dias[date.getDay()]
  const num = date.getDate()
  const mes = meses[date.getMonth()]
  return `${dia}, dia ${num} de ${mes}, às ${horaPorExtensoAudio(date)}`
}

module.exports = {
  numeroPorExtenso,
  formatarSlot,
  horaPorExtensoAudio,
  formatarSlotAudio
}
