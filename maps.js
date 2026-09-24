const box = (x, y, w, h) => [x, y, w, h];

export const MAPS = [
  {
    id: 'sanatorio', name: 'Sanatório Vesper', width: 2200, height: 1400,
    rooms: [box(80,80,520,360), box(780,80,500,360), box(1460,80,580,360), box(80,650,630,500), box(910,600,540,500), box(1650,650,390,500)],
    obstacles: [box(600,80,100,260),box(600,380,100,60),box(1280,80,180,70),box(1280,370,180,70),box(80,440,250,110),box(480,440,230,110),box(710,650,200,80),box(710,980,200,170),box(1450,600,200,100),box(1450,1000,200,100)],
    spawns: [[180,180],[1900,1060],[1100,200],[210,1000],[1750,200],[1100,1100]],
    quests: [[330,240,'Reativar gerador'],[1040,280,'Decifrar prontuários'],[1770,250,'Liberar ala selada'],[380,920,'Reparar rádio'],[1170,940,'Religar energia']]
  },
  {
    id: 'mansao', name: 'Mansão Noctis', width: 2400, height: 1400,
    rooms: [box(80,80,560,460),box(820,80,760,360),box(1760,80,540,460),box(80,720,740,520),box(1010,620,620,620),box(1810,700,490,540)],
    obstacles: [box(640,80,180,100),box(640,360,180,180),box(1580,80,180,180),box(1580,330,180,110),box(80,540,330,180),box(570,540,250,180),box(820,720,190,130),box(820,1080,190,160),box(1630,620,180,200),box(1630,1080,180,160)],
    spawns: [[200,210],[2100,1070],[1200,180],[240,1060],[2060,220],[1300,1100]],
    quests: [[300,310,'Acender candelabros'],[1190,240,'Abrir biblioteca'],[2050,290,'Recuperar chave mestra'],[400,970,'Sintonizar gramofone'],[1320,950,'Romper o selo']]
  },
  {
    id: 'terminal', name: 'Terminal Umbra', width: 2300, height: 1500,
    rooms: [box(80,90,620,430),box(900,90,520,430),box(1620,90,580,430),box(80,730,680,580),box(950,660,600,650),box(1740,720,460,590)],
    obstacles: [box(700,90,200,130),box(700,390,200,130),box(1420,90,200,200),box(1420,390,200,130),box(80,520,270,210),box(550,520,210,210),box(760,730,190,140),box(760,1130,190,180),box(1550,660,190,190),box(1550,1130,190,180)],
    spawns: [[210,220],[2050,1120],[1150,220],[230,1130],[2000,220],[1240,1130]],
    quests: [[340,300,'Rearmar painel'],[1150,270,'Enviar sinal'],[1930,300,'Destravar portão'],[380,1070,'Ligar locomotiva'],[1250,1040,'Carregar transmissão']]
  }
];

export function chooseMap() { return MAPS[Math.floor(Math.random() * MAPS.length)]; }
