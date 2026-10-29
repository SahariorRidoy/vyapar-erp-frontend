import { notFound } from 'next/navigation';

/** Any unknown address inside a company shows the 404 within the app shell instead of a blank page. */
export default function Missing() {
  notFound();
}
