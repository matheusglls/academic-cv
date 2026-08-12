import type {Metadata} from "next";
import {Geist,Source_Serif_4} from "next/font/google";
import "./globals.css";
const sans=Geist({variable:"--font-sans",subsets:["latin"]});const serif=Source_Serif_4({variable:"--font-serif",subsets:["latin"]});
export const metadata:Metadata={title:"Matheus Gallas Lopes, PhD",description:"Researcher in meta-research, translational validity, evidence synthesis, and reproducibility.",other:{"codex-preview":"development"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className={`${sans.variable} ${serif.variable}`}>{children}</body></html>}
