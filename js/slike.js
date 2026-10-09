// Pomanjšanje slik v brskalniku pred nalaganjem.
// Risanje na platno hkrati odstrani podatke EXIF (tudi GPS lokacijo).
window.spajzSlike = (function () {
  const NAJVEC_PX = 1200;
  const MALA_PX = 400; // za kartice in sličice
  const NAJVEC_BAJTOV = 1024 * 1024; // enako kot omejitev vedra v Supabase

  function naloziSliko(datoteka) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(datoteka);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Slike ni mogoče odpreti.'));
      };
      img.src = url;
    });
  }

  function vBlob(platno, tip, kakovost) {
    return new Promise((resolve) => platno.toBlob(resolve, tip, kakovost));
  }

  function narisi(img, najvecPx) {
    const razmerje = Math.min(1, najvecPx / Math.max(img.naturalWidth, img.naturalHeight));
    const platno = document.createElement('canvas');
    platno.width = Math.round(img.naturalWidth * razmerje);
    platno.height = Math.round(img.naturalHeight * razmerje);
    const ctx = platno.getContext('2d');
    ctx.fillStyle = '#fff'; // prozorno ozadje (PNG) postane belo
    ctx.fillRect(0, 0, platno.width, platno.height);
    ctx.drawImage(img, 0, 0, platno.width, platno.height);
    return platno;
  }

  // WebP, kjer ga brskalnik zna zapisati, sicer JPEG. Kakovost nižamo, dokler ni pod 1 MB.
  async function zapisi(platno, kakovosti) {
    for (const kakovost of kakovosti) {
      let blob = await vBlob(platno, 'image/webp', kakovost);
      if (!blob || blob.type !== 'image/webp') blob = await vBlob(platno, 'image/jpeg', kakovost);
      if (blob && blob.size <= NAJVEC_BAJTOV) return blob;
    }
    return null;
  }

  // Vrne { blob, tip, koncnica, mala } ali vrže napako s slovenskim sporočilom.
  async function pomanjsaj(datoteka) {
    if (!datoteka.type.startsWith('image/')) {
      throw new Error(`»${datoteka.name}« ni slika.`);
    }
    const img = await naloziSliko(datoteka);
    const blob = await zapisi(narisi(img, NAJVEC_PX), [0.82, 0.7, 0.55]);
    if (!blob) throw new Error(`Slike »${datoteka.name}« ni bilo mogoče dovolj pomanjšati.`);
    const mala = await zapisi(narisi(img, MALA_PX), [0.75]);
    return { blob, tip: blob.type, koncnica: blob.type === 'image/webp' ? 'webp' : 'jpg', mala };
  }

  return { pomanjsaj };
})();
