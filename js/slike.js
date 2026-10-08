// Pomanjšanje slik v brskalniku pred nalaganjem.
// Risanje na platno hkrati odstrani podatke EXIF (tudi GPS lokacijo).
window.spajzSlike = (function () {
  const NAJVEC_PX = 1200;
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

  // Vrne { blob, tip, koncnica } ali vrže napako s slovenskim sporočilom.
  async function pomanjsaj(datoteka) {
    if (!datoteka.type.startsWith('image/')) {
      throw new Error(`»${datoteka.name}« ni slika.`);
    }
    const img = await naloziSliko(datoteka);
    const razmerje = Math.min(1, NAJVEC_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const platno = document.createElement('canvas');
    platno.width = Math.round(img.naturalWidth * razmerje);
    platno.height = Math.round(img.naturalHeight * razmerje);
    const ctx = platno.getContext('2d');
    ctx.fillStyle = '#fff'; // prozorno ozadje (PNG) postane belo
    ctx.fillRect(0, 0, platno.width, platno.height);
    ctx.drawImage(img, 0, 0, platno.width, platno.height);

    // WebP, kjer ga brskalnik zna zapisati, sicer JPEG. Kakovost nižamo, dokler ni pod 1 MB.
    for (const kakovost of [0.82, 0.7, 0.55]) {
      let blob = await vBlob(platno, 'image/webp', kakovost);
      if (!blob || blob.type !== 'image/webp') blob = await vBlob(platno, 'image/jpeg', kakovost);
      if (blob && blob.size <= NAJVEC_BAJTOV) {
        return { blob, tip: blob.type, koncnica: blob.type === 'image/webp' ? 'webp' : 'jpg' };
      }
    }
    throw new Error(`Slike »${datoteka.name}« ni bilo mogoče dovolj pomanjšati.`);
  }

  return { pomanjsaj };
})();
