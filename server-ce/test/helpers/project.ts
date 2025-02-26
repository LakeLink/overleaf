import { login } from './login'
import { openEmail } from './email'
import { v4 as uuid } from 'uuid'

export function createProject(
  name: string,
  {
    type = 'Blank Project',
    newProjectButtonMatcher = /new project/i,
    open = true,
  }: {
    type?: 'Blank Project' | 'Example Project'
    newProjectButtonMatcher?: RegExp
    open?: boolean
  } = {}
): Cypress.Chainable<string> {
  cy.url().then(url => {
    if (!url.endsWith('/project')) {
      cy.visit('/project')
    }
  })
  const interceptId = uuid()
  let projectId = ''
  if (!open) {
    cy.then(() => {
      // Register intercept just before creating the project, otherwise we might
      // intercept a request from a prior createProject invocation.
      cy.intercept(
        { method: 'GET', url: /\/project\/[a-fA-F0-9]{24}$/, times: 1 },
        req => {
          projectId = req.url.split('/').pop()!
          // Redirect back to the project dashboard, effectively reload the page.
          req.redirect('/project')
        }
      ).as(interceptId)
    })
  }
  cy.findAllByRole('button').contains(newProjectButtonMatcher).click()
  // FIXME: This should only look in the left menu
  cy.findAllByText(type).first().click()
  cy.findByRole('dialog').within(() => {
    cy.get('input').type(name)
    cy.findByText('Create').click()
  })
  if (open) {
    cy.url().should('match', /\/project\/[a-fA-F0-9]{24}/)
    waitForMainDocToLoad()
    return cy
      .url()
      .should('match', /\/project\/[a-fA-F0-9]{24}/)
      .then(url => url.split('/').pop())
  } else {
    const alias = `@${interceptId}` // IDEs do not like computed values in cy.wait().
    cy.wait(alias)
    return cy.then(() => projectId)
  }
}

export function openProjectByName(projectName: string) {
  cy.visit('/project')
  cy.findByText(projectName).click()
  waitForMainDocToLoad()
}

export function openProjectViaLinkSharingAsAnon(url: string) {
  cy.visit(url)
  waitForMainDocToLoad()
}

export function openProjectViaLinkSharingAsUser(
  url: string,
  projectName: string,
  email: string
) {
  cy.visit(url)
  cy.findByText(projectName) // wait for lazy loading
  cy.findByText(email)
  cy.findByText('OK, join project').click()
  waitForMainDocToLoad()
}

export function openProjectViaInviteNotification(projectName: string) {
  cy.visit('/project')
  cy.findByText(projectName)
    .parent()
    .parent()
    .within(() => {
      cy.findByText('Join Project').click()
    })
  cy.findByText('Open Project').click()
  cy.url().should('match', /\/project\/[a-fA-F0-9]{24}/)
  waitForMainDocToLoad()
}

function shareProjectByEmail(
  projectName: string,
  email: string,
  level: 'Can view' | 'Can edit'
) {
  openProjectByName(projectName)
  cy.findByText('Share').click()
  cy.findByRole('dialog').within(() => {
    cy.findByLabelText('Add people', { selector: 'input' }).type(`${email},`)
    cy.findByLabelText('Add people', { selector: 'input' })
      .parents('form')
      .within(() => cy.findByText('Can edit').parent().select(level))
    cy.findByText('Invite').click({ force: true })
    cy.findByText('Invite not yet accepted.')
  })
}

export function shareProjectByEmailAndAcceptInviteViaDash(
  projectName: string,
  email: string,
  level: 'Can view' | 'Can edit'
) {
  shareProjectByEmail(projectName, email, level)

  login(email)
  openProjectViaInviteNotification(projectName)
}

export function shareProjectByEmailAndAcceptInviteViaEmail(
  projectName: string,
  email: string,
  level: 'Can view' | 'Can edit'
) {
  shareProjectByEmail(projectName, email, level)

  login(email)

  openEmail(projectName, frame => {
    frame.contains('View project').then(a => {
      cy.log(
        'bypass target=_blank and navigate current browser tab/cypress-iframe to project invite'
      )
      cy.visit(a.attr('href')!)
    })
  })
  cy.url().should('match', /\/project\/[a-f0-9]+\/invite\/token\/[a-f0-9]+/)
  cy.findByText(/user would like you to join/)
  cy.contains(new RegExp(`You are accepting this invite as ${email}`))
  cy.findByText('Join Project').click()
  waitForMainDocToLoad()
}

export function enableLinkSharing() {
  let linkSharingReadOnly: string
  let linkSharingReadAndWrite: string

  waitForMainDocToLoad()

  cy.findByText('Share').click()
  cy.findByText('Turn on link sharing').click()
  cy.findByText('Anyone with this link can view this project')
    .next()
    .should('contain.text', 'http://sharelatex/')
    .then(el => {
      linkSharingReadOnly = el.text()
    })
  cy.findByText('Anyone with this link can edit this project')
    .next()
    .should('contain.text', 'http://sharelatex/')
    .then(el => {
      linkSharingReadAndWrite = el.text()
    })

  return cy.then(() => {
    return { linkSharingReadOnly, linkSharingReadAndWrite }
  })
}

export function waitForMainDocToLoad() {
  cy.log('Wait for main doc to load; it will steal the focus after loading')
  cy.get('.cm-content').should('contain.text', 'Introduction')
}
