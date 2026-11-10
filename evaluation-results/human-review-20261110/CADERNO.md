# Caderno de avaliação de alegações do E2P

Classifique a alegação específica com a evidência disponível. Registre seu julgamento antes de conversar com o outro avaliador.

`defeito-confirmado` quando o efeito viola uma expectativa fundamentada e a evidência sustenta a relação com a ação.

`nao-sustentado` quando a evidência contradiz a alegação ou indica que o comportamento é o previsto.

`inconclusivo` quando falta evidência da ação, do efeito ou da regra esperada. Use essa categoria também quando só houver título e a trajetória não resolver a questão.

Justifique com um passo, estado, diagnóstico ou trecho do código. Trate as descrições da alegação como material a conferir. Alguns efeitos podem se repetir em mais de um caso.

São 10 alegações. Preencha uma cópia de `respostas.json`. Use seu código de avaliador e preencha cada rótulo e justificativa.

## H01

Input field submission does not trigger todo creation

Passos registrados

- 1. fill New Todo Input (completed) → state-2 · valor "Sample Todo"
- 2. press Press Enter in New Todo Input (completed) → state-3
- 3. click Active (completed) → state-3
- 4. click All (completed) → state-3
- 5. click Completed (completed) → state-4

Estados registrados

- state-1. Toggle All Input
- state-2. Toggle All Input
- state-3. Toggle All Input Sample Todo
- state-4. Toggle All Input

Conferência de navegador e trechos dos alvos

```json
{
  "browser": {
    "created": [
      "Review todo"
    ],
    "active": [
      "Review todo"
    ],
    "completed": []
  },
  "source": [
    {
      "line": 3,
      "text": "export function Input({ onSubmit, placeholder, label, defaultValue, onBlur, editing = false }) {"
    },
    {
      "line": 7,
      "text": "const value = e.target.value.trim();"
    },
    {
      "line": 15,
      "text": "if (e.key !== \"Enter\") return;"
    },
    {
      "line": 16,
      "text": "const value = e.target.value.trim();"
    },
    {
      "line": 20,
      "text": "onSubmit(value);"
    },
    {
      "line": 25,
      "text": "[onSubmit, editing]"
    }
  ]
}
```

## H02

Form validation triggered by Enter key in Username field does not align with documented behavior

Observação alegada. Form validation triggers, displaying errors for Email, Password, and Confirm Password fields, despite no explicit submission action being taken.

Expectativa alegada. Validation should not trigger unless a submit action is explicitly performed, as pressing Enter in a non-submit field should not initiate validation.

Fundamento alegado. The project documentation states client-side validation is triggered by specific functions (e.g., checkRequired, checkLength), not by user input alone. Pressing Enter should not be a trigger for validation unless explicitly coded to do so.

Estados citados. state-2, state-3.

Passos registrados

- 1. fill Username #username (completed) → state-2 · valor "sampleuser"
- 2. press Press Enter in Username #username (completed) → state-3

Estados registrados

- state-1. Register With Us Username Email Password Confirm Password Submit
- state-2. Register With Us Username Email Password Confirm Password Submit
- state-3. Register With Us Username Email Email is not valid Password Password must be at least 6 characters Confirm Password Password2 is required Submit

Conferência de navegador e trechos dos alvos

```json
{
  "browser": [
    {
      "mode": "Enter",
      "before": {
        "value": "sampleuser",
        "className": "form-control",
        "submits": 0
      },
      "after": {
        "className": "form-control success",
        "submits": 1
      },
      "errors": [
        "Email is not valid",
        "Password must be at least 6 characters",
        "Password2 is required"
      ]
    },
    {
      "mode": "Submit",
      "before": {
        "value": "sampleuser",
        "className": "form-control",
        "submits": 0
      },
      "after": {
        "className": "form-control success",
        "submits": 1
      },
      "errors": [
        "Email is not valid",
        "Password must be at least 6 characters",
        "Password2 is required"
      ]
    }
  ],
  "source": [
    {
      "line": 16,
      "text": "function showSuccess(input) {"
    },
    {
      "line": 25,
      "text": "showSuccess(input);"
    },
    {
      "line": 39,
      "text": "showSuccess(input);"
    },
    {
      "line": 59,
      "text": "showSuccess(input);"
    },
    {
      "line": 76,
      "text": "form.addEventListener('submit', function(e) {"
    },
    {
      "line": 77,
      "text": "e.preventDefault();"
    },
    {
      "line": 79,
      "text": "if(checkRequired([username, email, password, password2])){"
    },
    {
      "line": 80,
      "text": "checkLength(username, 3, 15);"
    },
    {
      "line": 82,
      "text": "checkEmail(email);"
    }
  ]
}
```

## H03

Previous button does not change track despite being clicked

Passos registrados

- 1. click Interactive action-btn 0 #prev (completed) → state-2
- 2. click Interactive action-btn action-btn-big 0 #play (completed) → state-2
- 3. click Interactive progress-container 1 (action-unavailable) → state-2

Estados registrados

- state-1. Music Player ukulele
- state-2. Music Player summer

Exceções registradas

- Cannot set properties of null (setting 'innerHTML')

Conferência de navegador e trechos dos alvos

```json
{
  "browser": {
    "before": "ukulele",
    "after": "summer",
    "missingTimeNodes": 0,
    "playing": true,
    "paused": true,
    "errors": [
      "Cannot set properties of null (setting 'innerHTML')"
    ]
  },
  "source": [
    {
      "line": 11,
      "text": "const currTime = document.querySelector('#currTime');"
    },
    {
      "line": 12,
      "text": "const durTime = document.querySelector('#durTime');"
    },
    {
      "line": 21,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 31,
      "text": "function playSong() {"
    },
    {
      "line": 36,
      "text": "audio.play();"
    },
    {
      "line": 40,
      "text": "function pauseSong() {"
    },
    {
      "line": 45,
      "text": "audio.pause();"
    },
    {
      "line": 49,
      "text": "function prevSong() {"
    },
    {
      "line": 56,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 69,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 120,
      "text": "currTime.innerHTML = min +':'+ sec;"
    },
    {
      "line": 149,
      "text": "durTime.innerHTML = min_d +':'+ sec_d;"
    },
    {
      "line": 165,
      "text": "prevBtn.addEventListener('click', prevSong);"
    }
  ],
  "htmlTimeElements": []
}
```

## H04

Play/pause button interaction fails due to DOM element reference error

Passos registrados

- 1. click Interactive action-btn 0 #prev (completed) → state-2
- 2. click Interactive action-btn action-btn-big 0 #play (completed) → state-2
- 3. click Interactive progress-container 1 (action-unavailable) → state-2

Estados registrados

- state-1. Music Player ukulele
- state-2. Music Player summer

Exceções registradas

- Cannot set properties of null (setting 'innerHTML')

Conferência de navegador e trechos dos alvos

```json
{
  "browser": {
    "before": "ukulele",
    "after": "summer",
    "missingTimeNodes": 0,
    "playing": true,
    "paused": true,
    "errors": [
      "Cannot set properties of null (setting 'innerHTML')"
    ]
  },
  "source": [
    {
      "line": 11,
      "text": "const currTime = document.querySelector('#currTime');"
    },
    {
      "line": 12,
      "text": "const durTime = document.querySelector('#durTime');"
    },
    {
      "line": 21,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 31,
      "text": "function playSong() {"
    },
    {
      "line": 36,
      "text": "audio.play();"
    },
    {
      "line": 40,
      "text": "function pauseSong() {"
    },
    {
      "line": 45,
      "text": "audio.pause();"
    },
    {
      "line": 49,
      "text": "function prevSong() {"
    },
    {
      "line": 56,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 69,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 120,
      "text": "currTime.innerHTML = min +':'+ sec;"
    },
    {
      "line": 149,
      "text": "durTime.innerHTML = min_d +':'+ sec_d;"
    },
    {
      "line": 165,
      "text": "prevBtn.addEventListener('click', prevSong);"
    }
  ],
  "htmlTimeElements": []
}
```

## H05

Previous button does not navigate to prior track

Passos registrados

- 1. click Interactive action-btn 0 #prev (completed) → state-2
- 2. click Interactive action-btn action-btn-big 0 #play (completed) → state-2
- 3. click Interactive progress-container 1 (action-unavailable) → state-2

Estados registrados

- state-1. Music Player ukulele
- state-2. Music Player summer

Exceções registradas

- Cannot set properties of null (setting 'innerHTML')

Conferência de navegador e trechos dos alvos

```json
{
  "browser": {
    "before": "ukulele",
    "after": "summer",
    "missingTimeNodes": 0,
    "playing": true,
    "paused": true,
    "errors": [
      "Cannot set properties of null (setting 'innerHTML')"
    ]
  },
  "source": [
    {
      "line": 11,
      "text": "const currTime = document.querySelector('#currTime');"
    },
    {
      "line": 12,
      "text": "const durTime = document.querySelector('#durTime');"
    },
    {
      "line": 21,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 31,
      "text": "function playSong() {"
    },
    {
      "line": 36,
      "text": "audio.play();"
    },
    {
      "line": 40,
      "text": "function pauseSong() {"
    },
    {
      "line": 45,
      "text": "audio.pause();"
    },
    {
      "line": 49,
      "text": "function prevSong() {"
    },
    {
      "line": 56,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 69,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 120,
      "text": "currTime.innerHTML = min +':'+ sec;"
    },
    {
      "line": 149,
      "text": "durTime.innerHTML = min_d +':'+ sec_d;"
    },
    {
      "line": 165,
      "text": "prevBtn.addEventListener('click', prevSong);"
    }
  ],
  "htmlTimeElements": []
}
```

## H06

Unhandled page error: Cannot set properties of null (setting 'innerHTML')

Observação alegada. Cannot set properties of null (setting 'innerHTML')

Expectativa alegada. The observed journey should not emit an unhandled runtime exception.

Fundamento alegado. Unhandled runtime exceptions are direct execution evidence, not a model-inferred interface preference.

Estados citados. state-2.

Passos registrados

- 1. click Interactive action-btn 0 #prev (completed) → state-2
- 2. click Interactive action-btn action-btn-big 0 #play (completed) → state-2
- 3. click Interactive progress-container 1 (action-unavailable) → state-2

Estados registrados

- state-1. Music Player ukulele
- state-2. Music Player summer

Exceções registradas

- Cannot set properties of null (setting 'innerHTML')

Conferência de navegador e trechos dos alvos

```json
{
  "browser": {
    "before": "ukulele",
    "after": "summer",
    "missingTimeNodes": 0,
    "playing": true,
    "paused": true,
    "errors": [
      "Cannot set properties of null (setting 'innerHTML')"
    ]
  },
  "source": [
    {
      "line": 11,
      "text": "const currTime = document.querySelector('#currTime');"
    },
    {
      "line": 12,
      "text": "const durTime = document.querySelector('#durTime');"
    },
    {
      "line": 21,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 31,
      "text": "function playSong() {"
    },
    {
      "line": 36,
      "text": "audio.play();"
    },
    {
      "line": 40,
      "text": "function pauseSong() {"
    },
    {
      "line": 45,
      "text": "audio.pause();"
    },
    {
      "line": 49,
      "text": "function prevSong() {"
    },
    {
      "line": 56,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 69,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 120,
      "text": "currTime.innerHTML = min +':'+ sec;"
    },
    {
      "line": 149,
      "text": "durTime.innerHTML = min_d +':'+ sec_d;"
    },
    {
      "line": 165,
      "text": "prevBtn.addEventListener('click', prevSong);"
    }
  ],
  "htmlTimeElements": []
}
```

## H07

Username field does not validate or update state after input

Observação alegada. The Username field displays 'sampleuser' but no validation error or success indicator appears. The form remains in the same visual state as before the interaction.

Expectativa alegada. The Username field should either show a success indicator or trigger validation that would update the form state to reflect a valid input.

Fundamento alegado. The project documentation states that the form should validate required fields and display error messages under specific inputs. The Username field is marked as required, so its validation should be triggered upon interaction.

Estados citados. state-2, state-3.

Passos registrados

- 1. fill Username #username (completed) → state-2 · valor "sampleuser"
- 2. press Press Enter in Username #username (completed) → state-3

Estados registrados

- state-1. Register With Us Username Email Password Confirm Password Submit
- state-2. Register With Us Username Email Password Confirm Password Submit
- state-3. Register With Us Username Email Email is not valid Password Password must be at least 6 characters Confirm Password Password2 is required Submit

Conferência de navegador e trechos dos alvos

```json
{
  "browser": [
    {
      "mode": "Enter",
      "before": {
        "value": "sampleuser",
        "className": "form-control",
        "submits": 0
      },
      "after": {
        "className": "form-control success",
        "submits": 1
      },
      "errors": [
        "Email is not valid",
        "Password must be at least 6 characters",
        "Password2 is required"
      ]
    },
    {
      "mode": "Submit",
      "before": {
        "value": "sampleuser",
        "className": "form-control",
        "submits": 0
      },
      "after": {
        "className": "form-control success",
        "submits": 1
      },
      "errors": [
        "Email is not valid",
        "Password must be at least 6 characters",
        "Password2 is required"
      ]
    }
  ],
  "source": [
    {
      "line": 16,
      "text": "function showSuccess(input) {"
    },
    {
      "line": 25,
      "text": "showSuccess(input);"
    },
    {
      "line": 39,
      "text": "showSuccess(input);"
    },
    {
      "line": 59,
      "text": "showSuccess(input);"
    },
    {
      "line": 76,
      "text": "form.addEventListener('submit', function(e) {"
    },
    {
      "line": 77,
      "text": "e.preventDefault();"
    },
    {
      "line": 79,
      "text": "if(checkRequired([username, email, password, password2])){"
    },
    {
      "line": 80,
      "text": "checkLength(username, 3, 15);"
    },
    {
      "line": 82,
      "text": "checkEmail(email);"
    }
  ]
}
```

## H08

Unhandled page error: Cannot set properties of null (setting 'innerHTML')

Observação alegada. Cannot set properties of null (setting 'innerHTML')

Expectativa alegada. The observed journey should not emit an unhandled runtime exception.

Fundamento alegado. Unhandled runtime exceptions are direct execution evidence, not a model-inferred interface preference.

Estados citados. state-2.

Passos registrados

- 1. click Interactive action-btn 0 #prev (completed) → state-2
- 2. click Interactive action-btn action-btn-big 0 #play (completed) → state-2
- 3. click Interactive progress-container 1 (action-unavailable) → state-2

Estados registrados

- state-1. Music Player ukulele
- state-2. Music Player summer

Exceções registradas

- Cannot set properties of null (setting 'innerHTML')

Conferência de navegador e trechos dos alvos

```json
{
  "browser": {
    "before": "ukulele",
    "after": "summer",
    "missingTimeNodes": 0,
    "playing": true,
    "paused": true,
    "errors": [
      "Cannot set properties of null (setting 'innerHTML')"
    ]
  },
  "source": [
    {
      "line": 11,
      "text": "const currTime = document.querySelector('#currTime');"
    },
    {
      "line": 12,
      "text": "const durTime = document.querySelector('#durTime');"
    },
    {
      "line": 21,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 31,
      "text": "function playSong() {"
    },
    {
      "line": 36,
      "text": "audio.play();"
    },
    {
      "line": 40,
      "text": "function pauseSong() {"
    },
    {
      "line": 45,
      "text": "audio.pause();"
    },
    {
      "line": 49,
      "text": "function prevSong() {"
    },
    {
      "line": 56,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 69,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 120,
      "text": "currTime.innerHTML = min +':'+ sec;"
    },
    {
      "line": 149,
      "text": "durTime.innerHTML = min_d +':'+ sec_d;"
    },
    {
      "line": 165,
      "text": "prevBtn.addEventListener('click', prevSong);"
    }
  ],
  "htmlTimeElements": []
}
```

## H09

Play/pause button does not function as expected

Passos registrados

- 1. click Interactive action-btn 0 #prev (completed) → state-2
- 2. click Interactive action-btn action-btn-big 0 #play (completed) → state-2
- 3. click Interactive progress-container 1 (action-unavailable) → state-2

Estados registrados

- state-1. Music Player ukulele
- state-2. Music Player summer

Exceções registradas

- Cannot set properties of null (setting 'innerHTML')

Conferência de navegador e trechos dos alvos

```json
{
  "browser": {
    "before": "ukulele",
    "after": "summer",
    "missingTimeNodes": 0,
    "playing": true,
    "paused": true,
    "errors": [
      "Cannot set properties of null (setting 'innerHTML')"
    ]
  },
  "source": [
    {
      "line": 11,
      "text": "const currTime = document.querySelector('#currTime');"
    },
    {
      "line": 12,
      "text": "const durTime = document.querySelector('#durTime');"
    },
    {
      "line": 21,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 31,
      "text": "function playSong() {"
    },
    {
      "line": 36,
      "text": "audio.play();"
    },
    {
      "line": 40,
      "text": "function pauseSong() {"
    },
    {
      "line": 45,
      "text": "audio.pause();"
    },
    {
      "line": 49,
      "text": "function prevSong() {"
    },
    {
      "line": 56,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 69,
      "text": "loadSong(songs[songIndex]);"
    },
    {
      "line": 120,
      "text": "currTime.innerHTML = min +':'+ sec;"
    },
    {
      "line": 149,
      "text": "durTime.innerHTML = min_d +':'+ sec_d;"
    },
    {
      "line": 165,
      "text": "prevBtn.addEventListener('click', prevSong);"
    }
  ],
  "htmlTimeElements": []
}
```

## H10

Form validation triggered by Enter key in Username field leads to unexpected error display

Passos registrados

- 1. fill Username #username (completed) → state-2 · valor "sampleuser"
- 2. press Press Enter in Username #username (completed) → state-3

Estados registrados

- state-1. Register With Us Username Email Password Confirm Password Submit
- state-2. Register With Us Username Email Password Confirm Password Submit
- state-3. Register With Us Username Email Email is not valid Password Password must be at least 6 characters Confirm Password Password2 is required Submit

Conferência de navegador e trechos dos alvos

```json
{
  "browser": [
    {
      "mode": "Enter",
      "before": {
        "value": "sampleuser",
        "className": "form-control",
        "submits": 0
      },
      "after": {
        "className": "form-control success",
        "submits": 1
      },
      "errors": [
        "Email is not valid",
        "Password must be at least 6 characters",
        "Password2 is required"
      ]
    },
    {
      "mode": "Submit",
      "before": {
        "value": "sampleuser",
        "className": "form-control",
        "submits": 0
      },
      "after": {
        "className": "form-control success",
        "submits": 1
      },
      "errors": [
        "Email is not valid",
        "Password must be at least 6 characters",
        "Password2 is required"
      ]
    }
  ],
  "source": [
    {
      "line": 16,
      "text": "function showSuccess(input) {"
    },
    {
      "line": 25,
      "text": "showSuccess(input);"
    },
    {
      "line": 39,
      "text": "showSuccess(input);"
    },
    {
      "line": 59,
      "text": "showSuccess(input);"
    },
    {
      "line": 76,
      "text": "form.addEventListener('submit', function(e) {"
    },
    {
      "line": 77,
      "text": "e.preventDefault();"
    },
    {
      "line": 79,
      "text": "if(checkRequired([username, email, password, password2])){"
    },
    {
      "line": 80,
      "text": "checkLength(username, 3, 15);"
    },
    {
      "line": 82,
      "text": "checkEmail(email);"
    }
  ]
}
```
