// History events: Wikipedia title | display name | year (negative = BC) | difficulty | blurb (our words)
// The builder cross-checks the year against Wikidata dates on the article (point in time, start, inception, opening...).
export const EVENTS = `
Ancient Olympic Games|The first recorded ancient Olympic Games|-776|3|Tradition dates the first Games at Olympia, in Greece, to 776 BC.
Battle of Marathon|The Battle of Marathon|-490|3|Athens defeated a Persian invasion force on the plain of Marathon.
Battle of Thermopylae|The Battle of Thermopylae|-480|3|A small Greek force led by 300 Spartans held a narrow pass against the Persian army.
Qin's wars of unification|Qin Shi Huang unifies China|-221|3|The state of Qin conquered its rivals, creating the first unified Chinese empire.
Assassination of Julius Caesar|The assassination of Julius Caesar|-44|2|Roman senators stabbed Caesar to death on the Ides of March.
Eruption of Mount Vesuvius in 79 AD|Vesuvius buries Pompeii|79|2|The volcano's eruption buried the Roman towns of Pompeii and Herculaneum under ash.
Hadrian's Wall|Work begins on Hadrian's Wall|122|3|The Roman emperor Hadrian ordered a wall across northern Britain.
Fall of the Western Roman Empire|The fall of the Western Roman Empire|476|3|The last western Roman emperor, Romulus Augustulus, was deposed.
Lindisfarne|Vikings raid Lindisfarne|793|3|A Viking raid on the island monastery is often taken as the start of the Viking Age in Britain.
Coronation of Charlemagne|Charlemagne is crowned emperor|800|3|The pope crowned the Frankish king Emperor of the Romans on Christmas Day.
Battle of Hastings|The Battle of Hastings|1066|1|William of Normandy defeated King Harold II and conquered England.
Magna Carta|Magna Carta is sealed|1215|2|King John agreed to a charter limiting royal power, at Runnymede.
Black Death|The Black Death reaches Europe|1347|2|Bubonic plague arrived in Europe and killed perhaps a third of its people within a few years.
Fall of Constantinople|The fall of Constantinople|1453|2|Ottoman forces captured the Byzantine capital, ending the Eastern Roman Empire.
Battle of Bosworth Field|The Battle of Bosworth Field|1485|3|Henry Tudor defeated Richard III, beginning the Tudor dynasty.
Voyages of Christopher Columbus|Columbus reaches the Americas|1492|1|Christopher Columbus landed in the Bahamas while trying to reach Asia by sailing west.
Ninety-five Theses|Martin Luther's Ninety-five Theses|1517|2|Luther's challenge to the Church helped launch the Protestant Reformation.
Magellan expedition|The first voyage around the world is completed|1522|2|The survivors of Ferdinand Magellan's expedition returned to Spain; Magellan himself died on the way.
Spanish Armada|The defeat of the Spanish Armada|1588|2|A Spanish invasion fleet sent against England was beaten and scattered by storms.
Gunpowder Plot|The Gunpowder Plot|1605|2|Plotters including Guy Fawkes tried and failed to blow up the English Parliament.
Mayflower|The Mayflower reaches America|1620|2|English Pilgrims sailed to found Plymouth Colony in what is now Massachusetts.
Peace of Westphalia|The Peace of Westphalia|1648|3|Treaties ended the Thirty Years' War in Europe.
Execution of Charles I|King Charles I is executed|1649|3|After the English Civil War, the king was beheaded in London.
Great Fire of London|The Great Fire of London|1666|1|A fire starting in a bakery on Pudding Lane destroyed much of the city.
Acts of Union 1707|England and Scotland unite|1707|3|The Acts of Union created the Kingdom of Great Britain.
First voyage of James Cook|Captain Cook reaches Botany Bay|1770|3|James Cook's ship Endeavour landed on the east coast of Australia.
Boston Tea Party|The Boston Tea Party|1773|2|American colonists dumped British tea into Boston Harbor in protest at taxes.
United States Declaration of Independence|The US Declaration of Independence|1776|1|Thirteen American colonies declared themselves independent from Britain.
First Fleet|The First Fleet arrives in Australia|1788|3|British ships carrying convicts founded a colony at Sydney Cove.
Storming of the Bastille|The storming of the Bastille|1789|2|Parisians stormed a royal fortress and prison, a key moment of the French Revolution.
Execution of Louis XVI|King Louis XVI is executed|1793|3|The French king was guillotined during the Revolution.
Louisiana Purchase|The Louisiana Purchase|1803|3|The United States bought a vast territory west of the Mississippi from France.
Coronation of Napoleon|Napoleon crowns himself emperor|1804|3|Napoleon took the crown from the pope's hands at Notre-Dame in Paris.
Battle of Trafalgar|The Battle of Trafalgar|1805|2|Nelson's British fleet defeated a French and Spanish fleet; Nelson was killed.
Slave Trade Act 1807|Britain abolishes the slave trade|1807|3|Parliament banned the trade in enslaved people across the British Empire.
Battle of Waterloo|The Battle of Waterloo|1815|2|Napoleon was finally defeated by Wellington and Blücher.
Stockton and Darlington Railway|The first public steam railway opens|1825|3|The Stockton and Darlington Railway in England carried passengers behind a steam locomotive.
Great Famine (Ireland)|The Great Famine begins in Ireland|1845|3|Potato blight caused a famine that killed about a million people.
California gold rush|The California Gold Rush|1848|3|The discovery of gold at Sutter's Mill drew hundreds of thousands of people west.
On the Origin of Species|Darwin publishes On the Origin of Species|1859|2|Charles Darwin set out his theory of evolution by natural selection.
American Civil War|The American Civil War begins|1861|2|Fighting broke out between the Union and the Confederate states.
Emancipation Proclamation|The Emancipation Proclamation|1863|3|Abraham Lincoln declared enslaved people in the Confederate states to be free.
Assassination of Abraham Lincoln|Abraham Lincoln is assassinated|1865|2|The president was shot at Ford's Theatre in Washington.
Meiji Restoration|The Meiji Restoration in Japan|1868|3|Imperial rule was restored and Japan began rapid modernisation.
Suez Canal|The Suez Canal opens|1869|2|The canal linked the Mediterranean and Red Seas, shortening the route from Europe to Asia.
Invention of the telephone|Bell patents the telephone|1876|2|Alexander Graham Bell received a patent for the telephone.
1883 eruption of Krakatoa|Krakatoa erupts|1883|3|A huge volcanic eruption in Indonesia was heard thousands of kilometres away.
Eiffel Tower|The Eiffel Tower is completed|1889|1|The tower was built as the entrance to the World's Fair in Paris.
1896 Summer Olympics|The first modern Olympic Games|1896|2|The modern Olympics began in Athens.
Wright Flyer|The Wright brothers' first powered flight|1903|1|Orville and Wilbur Wright flew at Kitty Hawk, North Carolina.
1906 San Francisco earthquake|The San Francisco earthquake|1906|3|An earthquake and the fires that followed destroyed much of the city.
Titanic|The Titanic sinks|1912|1|The liner struck an iceberg on its first voyage and sank with the loss of about 1,500 lives.
World War I|The First World War begins|1914|1|War broke out in Europe after the assassination of Archduke Franz Ferdinand.
Panama Canal|The Panama Canal opens|1914|3|The canal linked the Atlantic and Pacific Oceans across Panama.
Sinking of the RMS Lusitania|The Lusitania is sunk|1915|3|A German submarine sank the British liner off Ireland.
Battle of the Somme|The Battle of the Somme|1916|2|One of the bloodiest battles in history was fought in northern France.
October Revolution|The Russian Revolution|1917|2|The Bolsheviks led by Lenin seized power in Russia.
Armistice of 11 November 1918|The First World War ends|1918|1|An armistice ended the fighting at 11 am on 11 November.
Treaty of Versailles|The Treaty of Versailles|1919|2|The peace treaty set the terms for Germany after the First World War.
Discovery of the tomb of Tutankhamun|Tutankhamun's tomb is discovered|1922|2|Howard Carter found the almost untouched tomb in Egypt's Valley of the Kings.
History of penicillin|Alexander Fleming discovers penicillin|1928|2|Fleming noticed mould killing bacteria in a dish in his London laboratory.
Wall Street crash of 1929|The Wall Street Crash|1929|2|A stock market collapse in New York helped trigger the Great Depression.
1930 FIFA World Cup|The first FIFA World Cup|1930|2|Uruguay hosted and won the first football World Cup.
Adolf Hitler's rise to power|Hitler becomes chancellor of Germany|1933|2|The Nazi leader was appointed chancellor and soon became dictator.
Hindenburg disaster|The Hindenburg disaster|1937|3|A German passenger airship caught fire while landing in New Jersey.
World War II|The Second World War begins|1939|1|Germany invaded Poland; Britain and France declared war.
Attack on Pearl Harbor|The attack on Pearl Harbor|1941|2|Japan attacked the US naval base in Hawaii, bringing the US into the war.
Normandy landings|D-Day: the Normandy landings|1944|1|Allied troops landed on the beaches of Normandy in France.
Atomic bombings of Hiroshima and Nagasaki|Atomic bombs are dropped on Japan|1945|2|The US dropped atomic bombs on Hiroshima and Nagasaki.
United Nations|The United Nations is founded|1945|2|The UN was set up after the Second World War to keep international peace.
Partition of India|India and Pakistan become independent|1947|2|British rule ended and the subcontinent was divided into two countries.
National Health Service (England)|The NHS is founded|1948|3|Britain's National Health Service began offering free healthcare.
Proclamation of the People's Republic of China|The People's Republic of China is proclaimed|1949|3|Mao Zedong declared the new state in Beijing.
Korean War|The Korean War begins|1950|3|North Korea invaded South Korea.
1953 British Mount Everest expedition|Everest is climbed for the first time|1953|1|Edmund Hillary and Tenzing Norgay reached the summit.
Coronation of Elizabeth II|Queen Elizabeth II is crowned|1953|2|The coronation was watched on television by millions.
Montgomery bus boycott|Rosa Parks and the Montgomery bus boycott|1955|2|Rosa Parks's arrest for keeping her bus seat sparked a year-long boycott.
Sputnik 1|Sputnik, the first satellite, is launched|1957|2|The Soviet Union put the first artificial satellite into orbit.
Vostok 1|Yuri Gagarin becomes the first person in space|1961|1|The Soviet cosmonaut orbited the Earth once.
Berlin Wall|The Berlin Wall is built|1961|2|East Germany sealed off West Berlin with a wall.
Cuban Missile Crisis|The Cuban Missile Crisis|1962|2|The US and the Soviet Union came close to nuclear war over missiles in Cuba.
March on Washington for Jobs and Freedom|Martin Luther King Jr.'s "I Have a Dream" speech|1963|2|King spoke to about 250,000 people at the Lincoln Memorial.
Assassination of John F. Kennedy|President Kennedy is assassinated|1963|2|John F. Kennedy was shot in Dallas, Texas.
Apollo 11|Apollo 11 lands on the Moon|1969|1|Neil Armstrong and Buzz Aldrin became the first people to walk on the Moon.
Apollo 13|The Apollo 13 rescue|1970|3|An explosion forced the crew to abandon their Moon landing and loop home safely.
Resignation of Richard Nixon|Richard Nixon resigns|1974|3|The US president resigned over the Watergate scandal.
Concorde|Concorde begins passenger flights|1976|3|The supersonic airliner entered service with British Airways and Air France.
1980 eruption of Mount St. Helens|Mount St. Helens erupts|1980|3|The volcano in Washington State blew out its side in a huge eruption.
Space Shuttle Challenger disaster|The Challenger disaster|1986|3|The space shuttle broke apart shortly after launch.
Chernobyl disaster|The Chernobyl disaster|1986|2|A reactor exploded at a nuclear power plant in Soviet Ukraine.
Fall of the Berlin Wall|The fall of the Berlin Wall|1989|1|Crowds crossed and began tearing down the wall as East Germany opened its borders.
Hubble Space Telescope|The Hubble Space Telescope is launched|1990|3|The telescope was carried into orbit by a space shuttle.
German reunification|Germany is reunified|1990|2|East and West Germany became one country again.
Dissolution of the Soviet Union|The Soviet Union breaks up|1991|2|The USSR split into fifteen independent countries.
1994 South African general election|Nelson Mandela becomes president of South Africa|1994|2|South Africa's first fully democratic election ended apartheid rule.
Channel Tunnel|The Channel Tunnel opens|1994|2|A rail tunnel linked Britain and France under the sea.
Dolly (sheep)|Dolly the sheep is born|1996|3|Dolly was the first mammal cloned from an adult cell.
Transfer of sovereignty over Hong Kong|Hong Kong is handed back to China|1997|2|Britain returned Hong Kong to China after more than 150 years.
Wikipedia|Wikipedia is launched|2001|2|The free online encyclopedia anyone can edit went live.
September 11 attacks|The September 11 attacks|2001|2|Hijacked planes destroyed the World Trade Center in New York.
Euro banknotes|Euro notes and coins come into use|2002|2|Twelve European countries switched to euro cash.
Human Genome Project|The Human Genome Project is completed|2003|3|Scientists finished mapping nearly all human genes.
Facebook|Facebook is founded|2004|2|Mark Zuckerberg and fellow students launched it at Harvard.
2004 Indian Ocean earthquake and tsunami|The Indian Ocean tsunami|2004|2|An undersea earthquake caused tsunamis that killed about 230,000 people.
IPhone (1st generation)|The first iPhone goes on sale|2007|2|Apple released its first smartphone.
2008 United States presidential election|Barack Obama is elected US president|2008|2|Obama became the first African American president.
Higgs boson|The Higgs boson is discovered|2012|3|Scientists at CERN announced the long-sought particle.
2012 Summer Olympics|London hosts the Olympics for the third time|2012|2|London had also hosted the Games in 1908 and 1948.
2016 United Kingdom European Union membership referendum|The Brexit referendum|2016|2|UK voters chose to leave the European Union.
COVID-19 pandemic|COVID-19 is declared a pandemic|2020|1|The World Health Organization declared the outbreak a pandemic in March.
James Webb Space Telescope|The James Webb Space Telescope is launched|2021|3|The powerful infrared telescope was launched on Christmas Day.
Death and state funeral of Elizabeth II|Queen Elizabeth II dies|2022|2|She died at Balmoral after a reign of 70 years.
`;

// Reviewed by hand (C2b): Wikidata's dates here are the start or end of a longer process, not the event named.
export const HAND_CHECKED = {
  'The Black Death reaches Europe': 'Plague reached Sicily (Messina) in October 1347; Wikidata gives the pandemic span 1346–1352.',
  'Captain Cook reaches Botany Bay': 'Endeavour anchored in Botany Bay on 29 April 1770; Wikidata gives the voyage span 1768–1771.',
  'The First Fleet arrives in Australia': 'The fleet reached Botany Bay on 18–20 January 1788 after leaving England in May 1787.',
  'The Human Genome Project is completed': 'Declared complete in April 2003; Wikidata gives the 1990 start.',
  'COVID-19 is declared a pandemic': 'The WHO declared a pandemic on 11 March 2020; Wikidata gives the December 2019 outbreak start.',
};
