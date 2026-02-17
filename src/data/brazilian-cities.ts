// Lista de cidades brasileiras para autocomplete
// Organizada por estado, contém as principais cidades de cada UF

export interface BrazilianCity {
  name: string;
  state: string;
  label: string; // "Nome — UF"
}

// Lista curada de cidades brasileiras (capitais + cidades mais populosas/relevantes)
export const brazilianCities: BrazilianCity[] = [
  // Acre - AC
  { name: 'Rio Branco', state: 'AC', label: 'Rio Branco — AC' },
  { name: 'Cruzeiro do Sul', state: 'AC', label: 'Cruzeiro do Sul — AC' },
  
  // Alagoas - AL
  { name: 'Maceió', state: 'AL', label: 'Maceió — AL' },
  { name: 'Arapiraca', state: 'AL', label: 'Arapiraca — AL' },
  
  // Amapá - AP
  { name: 'Macapá', state: 'AP', label: 'Macapá — AP' },
  { name: 'Santana', state: 'AP', label: 'Santana — AP' },
  
  // Amazonas - AM
  { name: 'Manaus', state: 'AM', label: 'Manaus — AM' },
  { name: 'Parintins', state: 'AM', label: 'Parintins — AM' },
  { name: 'Itacoatiara', state: 'AM', label: 'Itacoatiara — AM' },
  
  // Bahia - BA
  { name: 'Salvador', state: 'BA', label: 'Salvador — BA' },
  { name: 'Feira de Santana', state: 'BA', label: 'Feira de Santana — BA' },
  { name: 'Vitória da Conquista', state: 'BA', label: 'Vitória da Conquista — BA' },
  { name: 'Camaçari', state: 'BA', label: 'Camaçari — BA' },
  { name: 'Itabuna', state: 'BA', label: 'Itabuna — BA' },
  { name: 'Juazeiro', state: 'BA', label: 'Juazeiro — BA' },
  { name: 'Ilhéus', state: 'BA', label: 'Ilhéus — BA' },
  { name: 'Lauro de Freitas', state: 'BA', label: 'Lauro de Freitas — BA' },
  { name: 'Jequié', state: 'BA', label: 'Jequié — BA' },
  { name: 'Teixeira de Freitas', state: 'BA', label: 'Teixeira de Freitas — BA' },
  { name: 'Barreiras', state: 'BA', label: 'Barreiras — BA' },
  { name: 'Alagoinhas', state: 'BA', label: 'Alagoinhas — BA' },
  { name: 'Porto Seguro', state: 'BA', label: 'Porto Seguro — BA' },
  { name: 'Simões Filho', state: 'BA', label: 'Simões Filho — BA' },
  { name: 'Paulo Afonso', state: 'BA', label: 'Paulo Afonso — BA' },
  { name: 'Eunápolis', state: 'BA', label: 'Eunápolis — BA' },
  { name: 'Santo Antônio de Jesus', state: 'BA', label: 'Santo Antônio de Jesus — BA' },
  { name: 'Valença', state: 'BA', label: 'Valença — BA' },
  { name: 'Candeias', state: 'BA', label: 'Candeias — BA' },
  { name: 'Guanambi', state: 'BA', label: 'Guanambi — BA' },
  
  // Ceará - CE
  { name: 'Fortaleza', state: 'CE', label: 'Fortaleza — CE' },
  { name: 'Caucaia', state: 'CE', label: 'Caucaia — CE' },
  { name: 'Juazeiro do Norte', state: 'CE', label: 'Juazeiro do Norte — CE' },
  { name: 'Maracanaú', state: 'CE', label: 'Maracanaú — CE' },
  { name: 'Sobral', state: 'CE', label: 'Sobral — CE' },
  { name: 'Crato', state: 'CE', label: 'Crato — CE' },
  { name: 'Itapipoca', state: 'CE', label: 'Itapipoca — CE' },
  { name: 'Maranguape', state: 'CE', label: 'Maranguape — CE' },
  { name: 'Iguatu', state: 'CE', label: 'Iguatu — CE' },
  { name: 'Quixadá', state: 'CE', label: 'Quixadá — CE' },
  
  // Distrito Federal - DF
  { name: 'Brasília', state: 'DF', label: 'Brasília — DF' },
  
  // Espírito Santo - ES
  { name: 'Vitória', state: 'ES', label: 'Vitória — ES' },
  { name: 'Vila Velha', state: 'ES', label: 'Vila Velha — ES' },
  { name: 'Serra', state: 'ES', label: 'Serra — ES' },
  { name: 'Cariacica', state: 'ES', label: 'Cariacica — ES' },
  { name: 'Linhares', state: 'ES', label: 'Linhares — ES' },
  { name: 'Cachoeiro de Itapemirim', state: 'ES', label: 'Cachoeiro de Itapemirim — ES' },
  { name: 'Colatina', state: 'ES', label: 'Colatina — ES' },
  { name: 'Guarapari', state: 'ES', label: 'Guarapari — ES' },
  { name: 'São Mateus', state: 'ES', label: 'São Mateus — ES' },
  { name: 'Aracruz', state: 'ES', label: 'Aracruz — ES' },
  
  // Goiás - GO
  { name: 'Goiânia', state: 'GO', label: 'Goiânia — GO' },
  { name: 'Aparecida de Goiânia', state: 'GO', label: 'Aparecida de Goiânia — GO' },
  { name: 'Anápolis', state: 'GO', label: 'Anápolis — GO' },
  { name: 'Rio Verde', state: 'GO', label: 'Rio Verde — GO' },
  { name: 'Luziânia', state: 'GO', label: 'Luziânia — GO' },
  { name: 'Águas Lindas de Goiás', state: 'GO', label: 'Águas Lindas de Goiás — GO' },
  { name: 'Valparaíso de Goiás', state: 'GO', label: 'Valparaíso de Goiás — GO' },
  { name: 'Trindade', state: 'GO', label: 'Trindade — GO' },
  { name: 'Formosa', state: 'GO', label: 'Formosa — GO' },
  { name: 'Novo Gama', state: 'GO', label: 'Novo Gama — GO' },
  { name: 'Senador Canedo', state: 'GO', label: 'Senador Canedo — GO' },
  { name: 'Itumbiara', state: 'GO', label: 'Itumbiara — GO' },
  { name: 'Jataí', state: 'GO', label: 'Jataí — GO' },
  { name: 'Catalão', state: 'GO', label: 'Catalão — GO' },
  { name: 'Planaltina', state: 'GO', label: 'Planaltina — GO' },
  
  // Maranhão - MA
  { name: 'São Luís', state: 'MA', label: 'São Luís — MA' },
  { name: 'Imperatriz', state: 'MA', label: 'Imperatriz — MA' },
  { name: 'São José de Ribamar', state: 'MA', label: 'São José de Ribamar — MA' },
  { name: 'Timon', state: 'MA', label: 'Timon — MA' },
  { name: 'Caxias', state: 'MA', label: 'Caxias — MA' },
  { name: 'Codó', state: 'MA', label: 'Codó — MA' },
  { name: 'Paço do Lumiar', state: 'MA', label: 'Paço do Lumiar — MA' },
  { name: 'Açailândia', state: 'MA', label: 'Açailândia — MA' },
  { name: 'Bacabal', state: 'MA', label: 'Bacabal — MA' },
  { name: 'Balsas', state: 'MA', label: 'Balsas — MA' },
  
  // Mato Grosso - MT
  { name: 'Cuiabá', state: 'MT', label: 'Cuiabá — MT' },
  { name: 'Várzea Grande', state: 'MT', label: 'Várzea Grande — MT' },
  { name: 'Rondonópolis', state: 'MT', label: 'Rondonópolis — MT' },
  { name: 'Sinop', state: 'MT', label: 'Sinop — MT' },
  { name: 'Tangará da Serra', state: 'MT', label: 'Tangará da Serra — MT' },
  { name: 'Cáceres', state: 'MT', label: 'Cáceres — MT' },
  { name: 'Sorriso', state: 'MT', label: 'Sorriso — MT' },
  { name: 'Lucas do Rio Verde', state: 'MT', label: 'Lucas do Rio Verde — MT' },
  { name: 'Primavera do Leste', state: 'MT', label: 'Primavera do Leste — MT' },
  { name: 'Barra do Garças', state: 'MT', label: 'Barra do Garças — MT' },
  { name: 'Alta Floresta', state: 'MT', label: 'Alta Floresta — MT' },
  { name: 'Campo Novo do Parecis', state: 'MT', label: 'Campo Novo do Parecis — MT' },
  { name: 'Pontes e Lacerda', state: 'MT', label: 'Pontes e Lacerda — MT' },
  { name: 'Nova Mutum', state: 'MT', label: 'Nova Mutum — MT' },
  { name: 'Juína', state: 'MT', label: 'Juína — MT' },
  { name: 'Colíder', state: 'MT', label: 'Colíder — MT' },
  { name: 'Guarantã do Norte', state: 'MT', label: 'Guarantã do Norte — MT' },
  { name: 'Juara', state: 'MT', label: 'Juara — MT' },
  { name: 'Peixoto de Azevedo', state: 'MT', label: 'Peixoto de Azevedo — MT' },
  { name: 'Sapezal', state: 'MT', label: 'Sapezal — MT' },
  
  // Mato Grosso do Sul - MS
  { name: 'Campo Grande', state: 'MS', label: 'Campo Grande — MS' },
  { name: 'Dourados', state: 'MS', label: 'Dourados — MS' },
  { name: 'Três Lagoas', state: 'MS', label: 'Três Lagoas — MS' },
  { name: 'Corumbá', state: 'MS', label: 'Corumbá — MS' },
  { name: 'Ponta Porã', state: 'MS', label: 'Ponta Porã — MS' },
  { name: 'Naviraí', state: 'MS', label: 'Naviraí — MS' },
  { name: 'Nova Andradina', state: 'MS', label: 'Nova Andradina — MS' },
  { name: 'Aquidauana', state: 'MS', label: 'Aquidauana — MS' },
  { name: 'Sidrolândia', state: 'MS', label: 'Sidrolândia — MS' },
  { name: 'Paranaíba', state: 'MS', label: 'Paranaíba — MS' },
  
  // Minas Gerais - MG
  { name: 'Belo Horizonte', state: 'MG', label: 'Belo Horizonte — MG' },
  { name: 'Uberlândia', state: 'MG', label: 'Uberlândia — MG' },
  { name: 'Contagem', state: 'MG', label: 'Contagem — MG' },
  { name: 'Juiz de Fora', state: 'MG', label: 'Juiz de Fora — MG' },
  { name: 'Betim', state: 'MG', label: 'Betim — MG' },
  { name: 'Montes Claros', state: 'MG', label: 'Montes Claros — MG' },
  { name: 'Ribeirão das Neves', state: 'MG', label: 'Ribeirão das Neves — MG' },
  { name: 'Uberaba', state: 'MG', label: 'Uberaba — MG' },
  { name: 'Governador Valadares', state: 'MG', label: 'Governador Valadares — MG' },
  { name: 'Ipatinga', state: 'MG', label: 'Ipatinga — MG' },
  { name: 'Sete Lagoas', state: 'MG', label: 'Sete Lagoas — MG' },
  { name: 'Divinópolis', state: 'MG', label: 'Divinópolis — MG' },
  { name: 'Santa Luzia', state: 'MG', label: 'Santa Luzia — MG' },
  { name: 'Ibirité', state: 'MG', label: 'Ibirité — MG' },
  { name: 'Poços de Caldas', state: 'MG', label: 'Poços de Caldas — MG' },
  { name: 'Patos de Minas', state: 'MG', label: 'Patos de Minas — MG' },
  { name: 'Pouso Alegre', state: 'MG', label: 'Pouso Alegre — MG' },
  { name: 'Teófilo Otoni', state: 'MG', label: 'Teófilo Otoni — MG' },
  { name: 'Barbacena', state: 'MG', label: 'Barbacena — MG' },
  { name: 'Sabará', state: 'MG', label: 'Sabará — MG' },
  { name: 'Varginha', state: 'MG', label: 'Varginha — MG' },
  { name: 'Conselheiro Lafaiete', state: 'MG', label: 'Conselheiro Lafaiete — MG' },
  { name: 'Vespasiano', state: 'MG', label: 'Vespasiano — MG' },
  // Cidade solicitada para operação de eventos/embarques
  { name: 'Pedro Leopoldo', state: 'MG', label: 'Pedro Leopoldo — MG' },
  { name: 'Araguari', state: 'MG', label: 'Araguari — MG' },
  { name: 'Itabira', state: 'MG', label: 'Itabira — MG' },
  { name: 'Passos', state: 'MG', label: 'Passos — MG' },
  { name: 'Coronel Fabriciano', state: 'MG', label: 'Coronel Fabriciano — MG' },
  { name: 'Muriaé', state: 'MG', label: 'Muriaé — MG' },
  { name: 'Ituiutaba', state: 'MG', label: 'Ituiutaba — MG' },
  { name: 'Lavras', state: 'MG', label: 'Lavras — MG' },
  
  // Pará - PA
  { name: 'Belém', state: 'PA', label: 'Belém — PA' },
  { name: 'Ananindeua', state: 'PA', label: 'Ananindeua — PA' },
  { name: 'Santarém', state: 'PA', label: 'Santarém — PA' },
  { name: 'Marabá', state: 'PA', label: 'Marabá — PA' },
  { name: 'Parauapebas', state: 'PA', label: 'Parauapebas — PA' },
  { name: 'Castanhal', state: 'PA', label: 'Castanhal — PA' },
  { name: 'Abaetetuba', state: 'PA', label: 'Abaetetuba — PA' },
  { name: 'Cametá', state: 'PA', label: 'Cametá — PA' },
  { name: 'Marituba', state: 'PA', label: 'Marituba — PA' },
  { name: 'Bragança', state: 'PA', label: 'Bragança — PA' },
  
  // Paraíba - PB
  { name: 'João Pessoa', state: 'PB', label: 'João Pessoa — PB' },
  { name: 'Campina Grande', state: 'PB', label: 'Campina Grande — PB' },
  { name: 'Santa Rita', state: 'PB', label: 'Santa Rita — PB' },
  { name: 'Patos', state: 'PB', label: 'Patos — PB' },
  { name: 'Bayeux', state: 'PB', label: 'Bayeux — PB' },
  { name: 'Sousa', state: 'PB', label: 'Sousa — PB' },
  { name: 'Cajazeiras', state: 'PB', label: 'Cajazeiras — PB' },
  { name: 'Cabedelo', state: 'PB', label: 'Cabedelo — PB' },
  { name: 'Guarabira', state: 'PB', label: 'Guarabira — PB' },
  { name: 'Sapé', state: 'PB', label: 'Sapé — PB' },
  
  // Paraná - PR
  { name: 'Curitiba', state: 'PR', label: 'Curitiba — PR' },
  { name: 'Londrina', state: 'PR', label: 'Londrina — PR' },
  { name: 'Maringá', state: 'PR', label: 'Maringá — PR' },
  { name: 'Ponta Grossa', state: 'PR', label: 'Ponta Grossa — PR' },
  { name: 'Cascavel', state: 'PR', label: 'Cascavel — PR' },
  { name: 'São José dos Pinhais', state: 'PR', label: 'São José dos Pinhais — PR' },
  { name: 'Foz do Iguaçu', state: 'PR', label: 'Foz do Iguaçu — PR' },
  { name: 'Colombo', state: 'PR', label: 'Colombo — PR' },
  { name: 'Guarapuava', state: 'PR', label: 'Guarapuava — PR' },
  { name: 'Paranaguá', state: 'PR', label: 'Paranaguá — PR' },
  { name: 'Araucária', state: 'PR', label: 'Araucária — PR' },
  { name: 'Toledo', state: 'PR', label: 'Toledo — PR' },
  { name: 'Apucarana', state: 'PR', label: 'Apucarana — PR' },
  { name: 'Pinhais', state: 'PR', label: 'Pinhais — PR' },
  { name: 'Campo Largo', state: 'PR', label: 'Campo Largo — PR' },
  { name: 'Arapongas', state: 'PR', label: 'Arapongas — PR' },
  { name: 'Almirante Tamandaré', state: 'PR', label: 'Almirante Tamandaré — PR' },
  { name: 'Umuarama', state: 'PR', label: 'Umuarama — PR' },
  { name: 'Piraquara', state: 'PR', label: 'Piraquara — PR' },
  { name: 'Cambé', state: 'PR', label: 'Cambé — PR' },
  
  // Pernambuco - PE
  { name: 'Recife', state: 'PE', label: 'Recife — PE' },
  { name: 'Jaboatão dos Guararapes', state: 'PE', label: 'Jaboatão dos Guararapes — PE' },
  { name: 'Olinda', state: 'PE', label: 'Olinda — PE' },
  { name: 'Caruaru', state: 'PE', label: 'Caruaru — PE' },
  { name: 'Petrolina', state: 'PE', label: 'Petrolina — PE' },
  { name: 'Paulista', state: 'PE', label: 'Paulista — PE' },
  { name: 'Cabo de Santo Agostinho', state: 'PE', label: 'Cabo de Santo Agostinho — PE' },
  { name: 'Camaragibe', state: 'PE', label: 'Camaragibe — PE' },
  { name: 'Garanhuns', state: 'PE', label: 'Garanhuns — PE' },
  { name: 'Vitória de Santo Antão', state: 'PE', label: 'Vitória de Santo Antão — PE' },
  { name: 'Igarassu', state: 'PE', label: 'Igarassu — PE' },
  { name: 'São Lourenço da Mata', state: 'PE', label: 'São Lourenço da Mata — PE' },
  { name: 'Abreu e Lima', state: 'PE', label: 'Abreu e Lima — PE' },
  { name: 'Santa Cruz do Capibaribe', state: 'PE', label: 'Santa Cruz do Capibaribe — PE' },
  { name: 'Ipojuca', state: 'PE', label: 'Ipojuca — PE' },
  
  // Piauí - PI
  { name: 'Teresina', state: 'PI', label: 'Teresina — PI' },
  { name: 'Parnaíba', state: 'PI', label: 'Parnaíba — PI' },
  { name: 'Picos', state: 'PI', label: 'Picos — PI' },
  { name: 'Piripiri', state: 'PI', label: 'Piripiri — PI' },
  { name: 'Floriano', state: 'PI', label: 'Floriano — PI' },
  { name: 'Campo Maior', state: 'PI', label: 'Campo Maior — PI' },
  { name: 'Barras', state: 'PI', label: 'Barras — PI' },
  { name: 'União', state: 'PI', label: 'União — PI' },
  { name: 'Altos', state: 'PI', label: 'Altos — PI' },
  { name: 'Pedro II', state: 'PI', label: 'Pedro II — PI' },
  
  // Rio de Janeiro - RJ
  { name: 'Rio de Janeiro', state: 'RJ', label: 'Rio de Janeiro — RJ' },
  { name: 'São Gonçalo', state: 'RJ', label: 'São Gonçalo — RJ' },
  { name: 'Duque de Caxias', state: 'RJ', label: 'Duque de Caxias — RJ' },
  { name: 'Nova Iguaçu', state: 'RJ', label: 'Nova Iguaçu — RJ' },
  { name: 'Niterói', state: 'RJ', label: 'Niterói — RJ' },
  { name: 'Belford Roxo', state: 'RJ', label: 'Belford Roxo — RJ' },
  { name: 'São João de Meriti', state: 'RJ', label: 'São João de Meriti — RJ' },
  { name: 'Campos dos Goytacazes', state: 'RJ', label: 'Campos dos Goytacazes — RJ' },
  { name: 'Petrópolis', state: 'RJ', label: 'Petrópolis — RJ' },
  { name: 'Volta Redonda', state: 'RJ', label: 'Volta Redonda — RJ' },
  { name: 'Magé', state: 'RJ', label: 'Magé — RJ' },
  { name: 'Itaboraí', state: 'RJ', label: 'Itaboraí — RJ' },
  { name: 'Mesquita', state: 'RJ', label: 'Mesquita — RJ' },
  { name: 'Nova Friburgo', state: 'RJ', label: 'Nova Friburgo — RJ' },
  { name: 'Barra Mansa', state: 'RJ', label: 'Barra Mansa — RJ' },
  { name: 'Macaé', state: 'RJ', label: 'Macaé — RJ' },
  { name: 'Cabo Frio', state: 'RJ', label: 'Cabo Frio — RJ' },
  { name: 'Angra dos Reis', state: 'RJ', label: 'Angra dos Reis — RJ' },
  { name: 'Nilópolis', state: 'RJ', label: 'Nilópolis — RJ' },
  { name: 'Teresópolis', state: 'RJ', label: 'Teresópolis — RJ' },
  
  // Rio Grande do Norte - RN
  { name: 'Natal', state: 'RN', label: 'Natal — RN' },
  { name: 'Mossoró', state: 'RN', label: 'Mossoró — RN' },
  { name: 'Parnamirim', state: 'RN', label: 'Parnamirim — RN' },
  { name: 'São Gonçalo do Amarante', state: 'RN', label: 'São Gonçalo do Amarante — RN' },
  { name: 'Ceará-Mirim', state: 'RN', label: 'Ceará-Mirim — RN' },
  { name: 'Macaíba', state: 'RN', label: 'Macaíba — RN' },
  { name: 'Caicó', state: 'RN', label: 'Caicó — RN' },
  { name: 'Açu', state: 'RN', label: 'Açu — RN' },
  { name: 'Currais Novos', state: 'RN', label: 'Currais Novos — RN' },
  { name: 'São José de Mipibu', state: 'RN', label: 'São José de Mipibu — RN' },
  
  // Rio Grande do Sul - RS
  { name: 'Porto Alegre', state: 'RS', label: 'Porto Alegre — RS' },
  { name: 'Caxias do Sul', state: 'RS', label: 'Caxias do Sul — RS' },
  { name: 'Canoas', state: 'RS', label: 'Canoas — RS' },
  { name: 'Pelotas', state: 'RS', label: 'Pelotas — RS' },
  { name: 'Santa Maria', state: 'RS', label: 'Santa Maria — RS' },
  { name: 'Gravataí', state: 'RS', label: 'Gravataí — RS' },
  { name: 'Viamão', state: 'RS', label: 'Viamão — RS' },
  { name: 'Novo Hamburgo', state: 'RS', label: 'Novo Hamburgo — RS' },
  { name: 'São Leopoldo', state: 'RS', label: 'São Leopoldo — RS' },
  { name: 'Rio Grande', state: 'RS', label: 'Rio Grande — RS' },
  { name: 'Alvorada', state: 'RS', label: 'Alvorada — RS' },
  { name: 'Passo Fundo', state: 'RS', label: 'Passo Fundo — RS' },
  { name: 'Sapucaia do Sul', state: 'RS', label: 'Sapucaia do Sul — RS' },
  { name: 'Uruguaiana', state: 'RS', label: 'Uruguaiana — RS' },
  { name: 'Santa Cruz do Sul', state: 'RS', label: 'Santa Cruz do Sul — RS' },
  { name: 'Cachoeirinha', state: 'RS', label: 'Cachoeirinha — RS' },
  { name: 'Bagé', state: 'RS', label: 'Bagé — RS' },
  { name: 'Bento Gonçalves', state: 'RS', label: 'Bento Gonçalves — RS' },
  { name: 'Erechim', state: 'RS', label: 'Erechim — RS' },
  { name: 'Guaíba', state: 'RS', label: 'Guaíba — RS' },
  
  // Rondônia - RO
  { name: 'Porto Velho', state: 'RO', label: 'Porto Velho — RO' },
  { name: 'Ji-Paraná', state: 'RO', label: 'Ji-Paraná — RO' },
  { name: 'Ariquemes', state: 'RO', label: 'Ariquemes — RO' },
  { name: 'Vilhena', state: 'RO', label: 'Vilhena — RO' },
  { name: 'Cacoal', state: 'RO', label: 'Cacoal — RO' },
  { name: 'Jaru', state: 'RO', label: 'Jaru — RO' },
  { name: 'Rolim de Moura', state: 'RO', label: 'Rolim de Moura — RO' },
  { name: 'Guajará-Mirim', state: 'RO', label: 'Guajará-Mirim — RO' },
  { name: 'Ouro Preto do Oeste', state: 'RO', label: 'Ouro Preto do Oeste — RO' },
  { name: 'Buritis', state: 'RO', label: 'Buritis — RO' },
  
  // Roraima - RR
  { name: 'Boa Vista', state: 'RR', label: 'Boa Vista — RR' },
  { name: 'Rorainópolis', state: 'RR', label: 'Rorainópolis — RR' },
  { name: 'Caracaraí', state: 'RR', label: 'Caracaraí — RR' },
  
  // Santa Catarina - SC
  { name: 'Florianópolis', state: 'SC', label: 'Florianópolis — SC' },
  { name: 'Joinville', state: 'SC', label: 'Joinville — SC' },
  { name: 'Blumenau', state: 'SC', label: 'Blumenau — SC' },
  { name: 'São José', state: 'SC', label: 'São José — SC' },
  { name: 'Chapecó', state: 'SC', label: 'Chapecó — SC' },
  { name: 'Criciúma', state: 'SC', label: 'Criciúma — SC' },
  { name: 'Itajaí', state: 'SC', label: 'Itajaí — SC' },
  { name: 'Jaraguá do Sul', state: 'SC', label: 'Jaraguá do Sul — SC' },
  { name: 'Lages', state: 'SC', label: 'Lages — SC' },
  { name: 'Palhoça', state: 'SC', label: 'Palhoça — SC' },
  { name: 'Balneário Camboriú', state: 'SC', label: 'Balneário Camboriú — SC' },
  { name: 'Brusque', state: 'SC', label: 'Brusque — SC' },
  { name: 'Tubarão', state: 'SC', label: 'Tubarão — SC' },
  { name: 'São Bento do Sul', state: 'SC', label: 'São Bento do Sul — SC' },
  { name: 'Caçador', state: 'SC', label: 'Caçador — SC' },
  { name: 'Concórdia', state: 'SC', label: 'Concórdia — SC' },
  { name: 'Camboriú', state: 'SC', label: 'Camboriú — SC' },
  { name: 'Navegantes', state: 'SC', label: 'Navegantes — SC' },
  { name: 'Rio do Sul', state: 'SC', label: 'Rio do Sul — SC' },
  { name: 'Araranguá', state: 'SC', label: 'Araranguá — SC' },
  
  // São Paulo - SP
  { name: 'São Paulo', state: 'SP', label: 'São Paulo — SP' },
  { name: 'Guarulhos', state: 'SP', label: 'Guarulhos — SP' },
  { name: 'Campinas', state: 'SP', label: 'Campinas — SP' },
  { name: 'São Bernardo do Campo', state: 'SP', label: 'São Bernardo do Campo — SP' },
  { name: 'Santo André', state: 'SP', label: 'Santo André — SP' },
  { name: 'São José dos Campos', state: 'SP', label: 'São José dos Campos — SP' },
  { name: 'Osasco', state: 'SP', label: 'Osasco — SP' },
  { name: 'Ribeirão Preto', state: 'SP', label: 'Ribeirão Preto — SP' },
  { name: 'Sorocaba', state: 'SP', label: 'Sorocaba — SP' },
  { name: 'Mauá', state: 'SP', label: 'Mauá — SP' },
  { name: 'São José do Rio Preto', state: 'SP', label: 'São José do Rio Preto — SP' },
  { name: 'Mogi das Cruzes', state: 'SP', label: 'Mogi das Cruzes — SP' },
  { name: 'Santos', state: 'SP', label: 'Santos — SP' },
  { name: 'Diadema', state: 'SP', label: 'Diadema — SP' },
  { name: 'Jundiaí', state: 'SP', label: 'Jundiaí — SP' },
  { name: 'Piracicaba', state: 'SP', label: 'Piracicaba — SP' },
  { name: 'Carapicuíba', state: 'SP', label: 'Carapicuíba — SP' },
  { name: 'Bauru', state: 'SP', label: 'Bauru — SP' },
  { name: 'Itaquaquecetuba', state: 'SP', label: 'Itaquaquecetuba — SP' },
  { name: 'São Vicente', state: 'SP', label: 'São Vicente — SP' },
  { name: 'Franca', state: 'SP', label: 'Franca — SP' },
  { name: 'Praia Grande', state: 'SP', label: 'Praia Grande — SP' },
  { name: 'Guarujá', state: 'SP', label: 'Guarujá — SP' },
  { name: 'Taubaté', state: 'SP', label: 'Taubaté — SP' },
  { name: 'Limeira', state: 'SP', label: 'Limeira — SP' },
  { name: 'Suzano', state: 'SP', label: 'Suzano — SP' },
  { name: 'Taboão da Serra', state: 'SP', label: 'Taboão da Serra — SP' },
  { name: 'Sumaré', state: 'SP', label: 'Sumaré — SP' },
  { name: 'Embu das Artes', state: 'SP', label: 'Embu das Artes — SP' },
  { name: 'Barueri', state: 'SP', label: 'Barueri — SP' },
  { name: 'Americana', state: 'SP', label: 'Americana — SP' },
  { name: 'Marília', state: 'SP', label: 'Marília — SP' },
  { name: 'Jacareí', state: 'SP', label: 'Jacareí — SP' },
  { name: 'Araraquara', state: 'SP', label: 'Araraquara — SP' },
  { name: 'Presidente Prudente', state: 'SP', label: 'Presidente Prudente — SP' },
  { name: 'Santa Bárbara d\'Oeste', state: 'SP', label: 'Santa Bárbara d\'Oeste — SP' },
  { name: 'Rio Claro', state: 'SP', label: 'Rio Claro — SP' },
  { name: 'Cotia', state: 'SP', label: 'Cotia — SP' },
  { name: 'Indaiatuba', state: 'SP', label: 'Indaiatuba — SP' },
  { name: 'Hortolândia', state: 'SP', label: 'Hortolândia — SP' },
  { name: 'Araçatuba', state: 'SP', label: 'Araçatuba — SP' },
  { name: 'Ferraz de Vasconcelos', state: 'SP', label: 'Ferraz de Vasconcelos — SP' },
  { name: 'São Carlos', state: 'SP', label: 'São Carlos — SP' },
  { name: 'Francisco Morato', state: 'SP', label: 'Francisco Morato — SP' },
  { name: 'Itapecerica da Serra', state: 'SP', label: 'Itapecerica da Serra — SP' },
  { name: 'Itapevi', state: 'SP', label: 'Itapevi — SP' },
  { name: 'Bragança Paulista', state: 'SP', label: 'Bragança Paulista — SP' },
  { name: 'Mogi Guaçu', state: 'SP', label: 'Mogi Guaçu — SP' },
  { name: 'Itu', state: 'SP', label: 'Itu — SP' },
  { name: 'Pindamonhangaba', state: 'SP', label: 'Pindamonhangaba — SP' },
  { name: 'Barretos', state: 'SP', label: 'Barretos — SP' },
  { name: 'Catanduva', state: 'SP', label: 'Catanduva — SP' },
  { name: 'Cubatão', state: 'SP', label: 'Cubatão — SP' },
  { name: 'Sertãozinho', state: 'SP', label: 'Sertãozinho — SP' },
  { name: 'Jandira', state: 'SP', label: 'Jandira — SP' },
  { name: 'Atibaia', state: 'SP', label: 'Atibaia — SP' },
  { name: 'Birigui', state: 'SP', label: 'Birigui — SP' },
  { name: 'Ribeirão Pires', state: 'SP', label: 'Ribeirão Pires — SP' },
  { name: 'Valinhos', state: 'SP', label: 'Valinhos — SP' },
  { name: 'Poá', state: 'SP', label: 'Poá — SP' },
  { name: 'Salto', state: 'SP', label: 'Salto — SP' },
  { name: 'Jaú', state: 'SP', label: 'Jaú — SP' },
  { name: 'Assis', state: 'SP', label: 'Assis — SP' },
  { name: 'Ourinhos', state: 'SP', label: 'Ourinhos — SP' },
  { name: 'Leme', state: 'SP', label: 'Leme — SP' },
  { name: 'Botucatu', state: 'SP', label: 'Botucatu — SP' },
  { name: 'São Caetano do Sul', state: 'SP', label: 'São Caetano do Sul — SP' },
  { name: 'Votorantim', state: 'SP', label: 'Votorantim — SP' },
  { name: 'Paulínia', state: 'SP', label: 'Paulínia — SP' },
  { name: 'Votuporanga', state: 'SP', label: 'Votuporanga — SP' },
  { name: 'Itatiba', state: 'SP', label: 'Itatiba — SP' },
  { name: 'Bebedouro', state: 'SP', label: 'Bebedouro — SP' },
  { name: 'Caraguatatuba', state: 'SP', label: 'Caraguatatuba — SP' },
  { name: 'Itapetininga', state: 'SP', label: 'Itapetininga — SP' },
  { name: 'São Sebastião', state: 'SP', label: 'São Sebastião — SP' },
  { name: 'Ubatuba', state: 'SP', label: 'Ubatuba — SP' },
  { name: 'Registro', state: 'SP', label: 'Registro — SP' },
  { name: 'Campos do Jordão', state: 'SP', label: 'Campos do Jordão — SP' },
  
  // Sergipe - SE
  { name: 'Aracaju', state: 'SE', label: 'Aracaju — SE' },
  { name: 'Nossa Senhora do Socorro', state: 'SE', label: 'Nossa Senhora do Socorro — SE' },
  { name: 'Lagarto', state: 'SE', label: 'Lagarto — SE' },
  { name: 'Itabaiana', state: 'SE', label: 'Itabaiana — SE' },
  { name: 'São Cristóvão', state: 'SE', label: 'São Cristóvão — SE' },
  { name: 'Estância', state: 'SE', label: 'Estância — SE' },
  { name: 'Tobias Barreto', state: 'SE', label: 'Tobias Barreto — SE' },
  { name: 'Simão Dias', state: 'SE', label: 'Simão Dias — SE' },
  { name: 'Propriá', state: 'SE', label: 'Propriá — SE' },
  { name: 'Capela', state: 'SE', label: 'Capela — SE' },
  
  // Tocantins - TO
  { name: 'Palmas', state: 'TO', label: 'Palmas — TO' },
  { name: 'Araguaína', state: 'TO', label: 'Araguaína — TO' },
  { name: 'Gurupi', state: 'TO', label: 'Gurupi — TO' },
  { name: 'Porto Nacional', state: 'TO', label: 'Porto Nacional — TO' },
  { name: 'Paraíso do Tocantins', state: 'TO', label: 'Paraíso do Tocantins — TO' },
  { name: 'Colinas do Tocantins', state: 'TO', label: 'Colinas do Tocantins — TO' },
  { name: 'Guaraí', state: 'TO', label: 'Guaraí — TO' },
  { name: 'Tocantinópolis', state: 'TO', label: 'Tocantinópolis — TO' },
  { name: 'Dianópolis', state: 'TO', label: 'Dianópolis — TO' },
  { name: 'Miracema do Tocantins', state: 'TO', label: 'Miracema do Tocantins — TO' },
];

// Helper para buscar cidades filtradas
export function searchCities(query: string, limit = 15): BrazilianCity[] {
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  return brazilianCities
    .filter(city => {
      const cityName = city.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const stateCode = city.state.toLowerCase();
      return cityName.includes(q) || stateCode.includes(q) || city.label.toLowerCase().includes(q);
    })
    .slice(0, limit);
}

// Helper para parsear "Cidade — UF" ou "Cidade - UF"
export function parseCityLabel(label: string | null | undefined): { city: string; state: string } {
  if (!label) return { city: '', state: '' };
  
  // Tenta separar por " — " ou " - "
  const separators = [' — ', ' - ', ' – '];
  for (const sep of separators) {
    if (label.includes(sep)) {
      const [city, state] = label.split(sep);
      return { 
        city: city?.trim() || '', 
        state: state?.trim().toUpperCase().slice(0, 2) || '' 
      };
    }
  }
  
  // Se não encontrou separador, tenta pegar os últimos 2 caracteres como UF
  const match = label.match(/^(.+?)\s*([A-Z]{2})$/i);
  if (match) {
    return { city: match[1].trim(), state: match[2].toUpperCase() };
  }
  
  return { city: label.trim(), state: '' };
}

// Helper para formatar cidade/estado como label
export function formatCityLabel(city: string | null | undefined, state: string | null | undefined): string {
  if (!city && !state) return '';
  if (!state) return city || '';
  if (!city) return state;
  return `${city} — ${state}`;
}

// Lista de UFs brasileiras
export const brazilianStates = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PR', name: 'Paraná' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'TO', name: 'Tocantins' },
];
