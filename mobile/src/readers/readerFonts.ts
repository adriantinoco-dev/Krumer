import { NotoSans_300Light } from '@expo-google-fonts/noto-sans/300Light';
import { NotoSans_400Regular } from '@expo-google-fonts/noto-sans/400Regular';
import { NotoSans_500Medium } from '@expo-google-fonts/noto-sans/500Medium';
import { NotoSans_700Bold } from '@expo-google-fonts/noto-sans/700Bold';
import { NotoSansMono_300Light } from '@expo-google-fonts/noto-sans-mono/300Light';
import { NotoSansMono_400Regular } from '@expo-google-fonts/noto-sans-mono/400Regular';
import { NotoSansMono_500Medium } from '@expo-google-fonts/noto-sans-mono/500Medium';
import { NotoSansMono_700Bold } from '@expo-google-fonts/noto-sans-mono/700Bold';
import { NotoSerif_300Light } from '@expo-google-fonts/noto-serif/300Light';
import { NotoSerif_400Regular } from '@expo-google-fonts/noto-serif/400Regular';
import { NotoSerif_500Medium } from '@expo-google-fonts/noto-serif/500Medium';
import { NotoSerif_700Bold } from '@expo-google-fonts/noto-serif/700Bold';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { useFonts } from 'expo-font';
import type { ReadingFontFamily, ReadingFontWeight } from '../models/readingPreferences';
import type { EpubFontFace, EpubFontWeight } from './epubBridge';

type FontDefinition = {
  asset: number;
  nativeFamily: string;
  weight: EpubFontWeight;
};

const FONT_DEFINITIONS: Record<ReadingFontFamily, FontDefinition[]> = {
  serif: [
    { asset: NotoSerif_300Light, nativeFamily: 'KrumerNotoSerif300', weight: 300 },
    { asset: NotoSerif_400Regular, nativeFamily: 'KrumerNotoSerif400', weight: 400 },
    { asset: NotoSerif_500Medium, nativeFamily: 'KrumerNotoSerif500', weight: 500 },
    { asset: NotoSerif_700Bold, nativeFamily: 'KrumerNotoSerif700', weight: 700 },
  ],
  sans: [
    { asset: NotoSans_300Light, nativeFamily: 'KrumerNotoSans300', weight: 300 },
    { asset: NotoSans_400Regular, nativeFamily: 'KrumerNotoSans400', weight: 400 },
    { asset: NotoSans_500Medium, nativeFamily: 'KrumerNotoSans500', weight: 500 },
    { asset: NotoSans_700Bold, nativeFamily: 'KrumerNotoSans700', weight: 700 },
  ],
  mono: [
    { asset: NotoSansMono_300Light, nativeFamily: 'KrumerNotoSansMono300', weight: 300 },
    { asset: NotoSansMono_400Regular, nativeFamily: 'KrumerNotoSansMono400', weight: 400 },
    { asset: NotoSansMono_500Medium, nativeFamily: 'KrumerNotoSansMono500', weight: 500 },
    { asset: NotoSansMono_700Bold, nativeFamily: 'KrumerNotoSansMono700', weight: 700 },
  ],
};

const CSS_FONT_FAMILIES: Record<ReadingFontFamily, string> = {
  serif: 'Krumer Noto Serif',
  sans: 'Krumer Noto Sans',
  mono: 'Krumer Noto Sans Mono',
};

const NATIVE_FONT_SOURCES = Object.values(FONT_DEFINITIONS)
  .flat()
  .reduce<Record<string, number>>((sources, definition) => {
    sources[definition.nativeFamily] = definition.asset;
    return sources;
  }, {});

const epubFontCache = new Map<ReadingFontFamily, Promise<EpubFontFace[]>>();

function numericWeight(weight: ReadingFontWeight): EpubFontWeight {
  if (weight === 'light') return 300;
  if (weight === 'medium') return 500;
  if (weight === 'bold') return 700;
  return 400;
}

export function useReaderFonts() {
  const [loaded, error] = useFonts(NATIVE_FONT_SOURCES);
  return { error, loaded };
}

export function readerNativeFontFamily(family: ReadingFontFamily, weight: ReadingFontWeight = 'regular') {
  const targetWeight = numericWeight(weight);
  return FONT_DEFINITIONS[family].find((definition) => definition.weight === targetWeight)?.nativeFamily
    ?? FONT_DEFINITIONS[family][1].nativeFamily;
}

export function loadEpubFontFaces(family: ReadingFontFamily) {
  const cached = epubFontCache.get(family);
  if (cached) return cached;

  const pending = Promise.all(FONT_DEFINITIONS[family].map(async (definition): Promise<EpubFontFace> => {
    const asset = Asset.fromModule(definition.asset);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    const dataBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return {
      dataBase64,
      family,
      fontFamily: CSS_FONT_FAMILIES[family],
      mimeType: 'font/ttf',
      weight: definition.weight,
    };
  }));
  epubFontCache.set(family, pending);
  pending.catch(() => epubFontCache.delete(family));
  return pending;
}
