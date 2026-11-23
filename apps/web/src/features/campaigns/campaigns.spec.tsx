import { CSRF_HEADER, type OwnCampaign, type PublicCampaign } from '@fundizo/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignPage } from './public/campaign-page';
import { resumeStep } from './resume-step';
import { StepCategory } from './wizard/step-category';
import { StepGoal } from './wizard/step-goal';
import { StepReview } from './wizard/step-review';
import { StepStory } from './wizard/step-story';
import { StepWho } from './wizard/step-who';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const ID = '0b9a5a3c-1f2e-4d5c-8b7a-6e5f4d3c2b1a';
const draft: OwnCampaign = {
  id: ID,
  status: 'draft',
  slug: null,
  beneficiary: { kind: 'someone_else', name: 'Joseph Banda', relationship: 'Brother', phone: null },
  category: 'medical',
  goalNgwee: 6_000_000,
  endDate: null,
  title: 'Help Joseph get his heart surgery at UTH',
  story: {
    whatHappened:
      'In October doctors at Kabwe General found a blocked heart valve and referred Joseph to UTH.',
    moneyFor: 'The operation and two weeks in hospital.',
    extra: '',
  },
  province: 'Central',
  district: 'Kabwe',
  publishedAt: null,
  updatedAt: '2026-11-23T10:00:00.000Z',
};

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>(() => json({ campaign: draft }));
  vi.stubGlobal('fetch', fetchMock);
  Object.values(router).forEach((f) => f.mockReset());
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return {
    url,
    method: init?.method,
    csrf: new Headers(init?.headers).get(CSRF_HEADER),
    body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as unknown,
  };
};

describe('step 1: who', () => {
  it('creates the draft for yourself and moves on', async () => {
    const u = userEvent.setup();
    render(<StepWho campaignId={null} initial={null} />);
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/start/${ID}/category`));
    expect(lastCall()).toMatchObject({
      url: '/api/campaigns',
      method: 'POST',
      csrf: '1',
      body: { beneficiary: { kind: 'self' } },
    });
  });

  it('asks for a name and relationship when raising for someone else', async () => {
    const u = userEvent.setup();
    render(<StepWho campaignId={null} initial={null} />);
    await u.click(screen.getByRole('radio', { name: /Someone else/ }));
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter their full name.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('step 2: category', () => {
  it('saves the choice and explains funerals', async () => {
    const u = userEvent.setup();
    render(<StepCategory campaignId={ID} initial={null} />);
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose the closest match');
    await u.click(screen.getByRole('radio', { name: /Funeral/ }));
    expect(screen.getByRole('status')).toHaveTextContent('don’t need a goal');
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/start/${ID}/goal`));
    expect(lastCall()).toMatchObject({
      url: `/api/campaigns/${ID}`,
      method: 'PATCH',
      body: { category: 'funeral' },
    });
  });
});

describe('step 3: goal', () => {
  const empty = { goalNgwee: null, endDate: null, province: null, district: null };

  it('turns kwacha into whole ngwee', async () => {
    const u = userEvent.setup();
    render(<StepGoal campaignId={ID} category="medical" initial={empty} />);
    await u.type(screen.getByLabelText('Goal in kwacha'), '60,000');
    expect(screen.getByText(/^K60,000\./)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/start/${ID}/story`));
    expect(lastCall().body).toEqual({
      goalNgwee: 6_000_000,
      endDate: null,
      province: null,
      district: null,
    });
  });

  it('needs a goal, except for funerals', async () => {
    const u = userEvent.setup();
    const { unmount } = render(<StepGoal campaignId={ID} category="medical" initial={empty} />);
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Set a goal/)).toBeInTheDocument();
    unmount();
    render(<StepGoal campaignId={ID} category="funeral" initial={empty} />);
    expect(screen.getByLabelText('Goal in kwacha (optional)')).toBeInTheDocument();
  });
});

describe('step 4: story', () => {
  it('checks the story is long enough before saving', async () => {
    const u = userEvent.setup();
    render(
      <StepStory
        campaignId={ID}
        category="medical"
        initial={{ title: '', story: { whatHappened: '', moneyFor: '', extra: '' } }}
      />,
    );
    await u.type(screen.getByLabelText('Title'), 'Help Joseph');
    expect(screen.getByText('11 / 60')).toBeInTheDocument();
    await u.type(screen.getByLabelText('Who needs help, and what happened?'), 'Too short.');
    await u.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/at least 40 characters/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('step 5: review', () => {
  const organiser = {
    firstName: 'Mary',
    lastName: 'Banda',
    emailVerified: true,
    phoneConfirmed: true,
  };

  it('publishes and goes to the live page', async () => {
    fetchMock.mockImplementation(() =>
      json({
        campaign: {
          ...draft,
          status: 'published',
          slug: 'help-joseph-k3x9',
          publishedAt: '2026-11-23T11:00:00.000Z',
        },
      }),
    );
    const u = userEvent.setup();
    render(<StepReview campaign={draft} organiser={organiser} />);
    expect(screen.getByText('Ready to publish')).toBeInTheDocument();
    expect(screen.getByText('Joseph Banda (Brother)')).toBeInTheDocument();
    expect(screen.getByText('K60,000')).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Publish fundraiser' }));
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith('/f/help-joseph-k3x9?published=1'),
    );
  });

  it('can’t publish without a confirmed phone, and links to the profile', () => {
    render(<StepReview campaign={draft} organiser={{ ...organiser, phoneConfirmed: false }} />);
    expect(screen.getByRole('button', { name: 'Publish fundraiser' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Go to your profile' })).toHaveAttribute(
      'href',
      '/account',
    );
  });
});

describe('public page', () => {
  const pub: PublicCampaign = {
    slug: 'help-joseph-k3x9',
    title: draft.title,
    category: 'medical',
    story: draft.story,
    goalNgwee: 6_000_000,
    raisedNgwee: 0,
    donorCount: 0,
    endDate: null,
    province: 'Central',
    district: 'Kabwe',
    organiser: { firstName: 'Mary', lastName: 'Banda' },
    beneficiary: { name: 'Joseph Banda', relationship: 'Brother' },
    verified: false,
    publishedAt: '2026-11-23T11:00:00.000Z',
  };

  it('shows the story, who is organising for whom, and a calm verification note', () => {
    render(<CampaignPage campaign={pub} justPublished={false} />);
    expect(screen.getByRole('heading', { level: 1, name: draft.title })).toBeInTheDocument();
    expect(screen.getAllByText('Mary Banda')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Kabwe, Central')[0]).toBeInTheDocument();
    expect(screen.getByText('Verification in progress')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Donations open soon' })[0]).toBeDisabled();
  });

  it('celebrates straight after publishing', () => {
    render(<CampaignPage campaign={pub} justPublished />);
    expect(screen.getByRole('status')).toHaveTextContent('Your fundraiser is live.');
  });
});

describe('resumeStep', () => {
  it('returns the first unfinished step', () => {
    expect(resumeStep({ ...draft, category: null })).toBe('category');
    expect(resumeStep({ ...draft, goalNgwee: null })).toBe('goal');
    expect(resumeStep({ ...draft, category: 'funeral', goalNgwee: null })).toBe('review');
    expect(resumeStep({ ...draft, title: '' })).toBe('story');
    expect(resumeStep(draft)).toBe('review');
  });
});
