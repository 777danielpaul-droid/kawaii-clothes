export interface Product { id: string; name: string; jp: string; kind: string; price: number; tile: string; img: string; speed: number; fx: string; fy: string; rot: string; py: string; wide?: boolean; gallery?: string[]; }

/* jp = Name als wörtliche japanische Übersetzung (Wort für Wort, nicht sinngemäß) */
/* fx/fy/rot = Startversatz und -drehung, aus denen die Karte hereinfliegt (Richtung je Shirt anders); py = Parallax-Drift beim Durchscrollen; speed = Locomotive-Tempo */
export const products: Product[] = [
  { id: 'KC-01', name: 'Dino Bunny', jp: 'ディノバニー', kind: 'Oversize Tee', price: 34, tile: '#E6E1FA', img: 'patch-dino', speed: 0.02, fx: '-40vw', fy: '6vh', rot: '-10deg', py: '-80px', gallery: ['mock-black', 'mock-white', 'model-black', 'model-white'] },
  { id: 'KC-02', name: 'Space Cat', jp: 'スペース猫', kind: 'Oversize Tee', price: 32, tile: '#DDEBFF', img: 'cyber-cat', speed: 0.16, fx: '42vw', fy: '4vh', rot: '9deg', py: '140px', gallery: ['mock-black', 'mock-white', 'model-black', 'model-white'] },
  { id: 'KC-03', name: 'Prime Dino', jp: 'プライム恐竜', kind: 'Oversize Tee', price: 36, tile: '#E4E9EE', img: 'peaky-dino', speed: 0.08, fx: '-44vw', fy: '-10vh', rot: '-6deg', py: '-140px', gallery: ['mock-black', 'mock-white', 'model-black', 'model-white'] },
  { id: 'KC-04', name: 'Larp', jp: 'ラープ', kind: 'Oversize Tee', price: 34, tile: '#F4E3EE', img: 'dino-kitty', speed: 0.22, fx: '36vw', fy: '30vh', rot: '-8deg', py: '180px', gallery: ['mock-black', 'mock-white', 'model-black', 'model-white'] },
];
