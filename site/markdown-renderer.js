(function registerMarkdownRenderer(root) {
  const CJK_STRONG_BOUNDARY_MARKER = '<!--kb-cjk-strong-boundary-->';
  const CJK_AT_START = /^[\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u;

  function isEscaped(text, index) {
    let slashCount = 0;
    for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) slashCount++;
    return slashCount % 2 === 1;
  }

  function readRun(text, index, character) {
    let end = index;
    while (text[end] === character) end++;
    return end - index;
  }

  function readFence(line) {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    return match ? { character: match[1][0], length: match[1].length } : null;
  }

  function isClosingFence(line, fence) {
    const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
    return Boolean(
      match
      && match[1][0] === fence.character
      && match[1].length >= fence.length
    );
  }

  function stabilizeCjkStrongBoundaries(source) {
    const state = {
      fence: null,
      inlineCodeTicks: 0,
      strongOpen: false,
    };

    return String(source).split(/(\r?\n)/).map(part => {
      if (part === '\n' || part === '\r\n') return part;

      if (state.fence) {
        if (isClosingFence(part, state.fence)) state.fence = null;
        return part;
      }

      const openingFence = readFence(part);
      if (openingFence) {
        state.fence = openingFence;
        state.inlineCodeTicks = 0;
        state.strongOpen = false;
        return part;
      }

      if (part.trim() === '') {
        state.inlineCodeTicks = 0;
        state.strongOpen = false;
        return part;
      }

      let output = '';
      for (let i = 0; i < part.length;) {
        if (part[i] === '`' && !isEscaped(part, i)) {
          const runLength = readRun(part, i, '`');
          if (state.inlineCodeTicks === 0) state.inlineCodeTicks = runLength;
          else if (state.inlineCodeTicks === runLength) state.inlineCodeTicks = 0;
          output += part.slice(i, i + runLength);
          i += runLength;
          continue;
        }

        const isStrongDelimiter = state.inlineCodeTicks === 0
          && part.startsWith('**', i)
          && part[i - 1] !== '*'
          && part[i + 2] !== '*'
          && !isEscaped(part, i);

        if (isStrongDelimiter) {
          output += '**';
          if (state.strongOpen) {
            state.strongOpen = false;
            if (CJK_AT_START.test(part.slice(i + 2))) {
              output += CJK_STRONG_BOUNDARY_MARKER;
            }
          } else {
            state.strongOpen = true;
          }
          i += 2;
          continue;
        }

        output += part[i];
        i++;
      }
      return output;
    }).join('');
  }

  root.KBMarkdownRenderer = Object.freeze({
    CJK_STRONG_BOUNDARY_MARKER,
    stabilizeCjkStrongBoundaries,
  });
})(typeof window === 'undefined' ? globalThis : window);
