import Link from 'next/link';
import { GolfPlayer } from './player';
export const metadata = { title: 'Pocket golf · Screenjoy' };
export default function GolfPage() { return <main className="golf-page"><header className="golf-header"><Link href="/">screenjoy</Link><span>Pocket golf</span></header><GolfPlayer /></main>; }
