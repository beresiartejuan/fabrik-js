import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import Home from '@/app/page';

test('renders the getting started heading', () => {
  render(<Home />);
  const heading = screen.getByRole('heading', { level: 1 });
  expect(heading).toBeInTheDocument();
  expect(heading.textContent).toContain('page.tsx');
});

test('renders the documentation link', () => {
  render(<Home />);
  const docsLink = screen.getByRole('link', { name: 'Documentation' });
  expect(docsLink.getAttribute('href')).toContain('https://nextjs.org/docs');
});
