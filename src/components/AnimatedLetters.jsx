const AnimatedLetters = ({ letterClass, text, idx = 0 }) => {
  const letters = text.split('');

  return (
    <span>
      {letters.map((char, i) =>
        char === ' ' ? (
          ' '
        ) : (
          <span key={char + i} className={`${letterClass} _${i + idx}`}>
            {char}
          </span>
        )
      )}
    </span>
  );
};

export default AnimatedLetters;
