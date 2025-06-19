import { describe, it, expect } from 'vitest'

describe('Main', () => {
  it('should be able to run tests', () => {
    expect(1 + 1).toBe(2)
  })
  
  it('should have access to DOM', () => {
    const div = document.createElement('div')
    div.textContent = 'Hello World'
    expect(div.textContent).toBe('Hello World')
  })
}) 